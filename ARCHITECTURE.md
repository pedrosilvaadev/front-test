# Arquitetura — Kurio (marketplace de NFTs)

Este documento cobre a visão geral da arquitetura, as políticas de sessão, carrinho e cache, a reconciliação entre REST e Socket.IO, as limitações conhecidas, as decisões de UX e os desvios do Figma.

O detalhe de cada endpoint e evento está em [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md). As decisões formais (ADRs) estão em [`docs/DECISIONS.md`](docs/DECISIONS.md).

## 1. Camadas

```
UI (src/features/*/components, src/routes)
  │  hooks e queryOptions por domínio (TanStack Query) · estado do catálogo na URL (TanStack Router)
  ▼
API tipada (src/api/*) ── Axios (instância única) ── respostas 2xx validadas com zod (src/contracts)
  │                         erros normalizados em ApiError (kind/code/retryable)
  ▼
Rede ── MSW (service worker) ── handlers REST (src/mocks/handlers) ── "banco" (src/mocks/db.ts)
  ▲                                                                       │ commits com versão
  └── socket.io-client ◄── WebSocket interceptado ◄── src/mocks/realtime-server.ts
```

- **`src/contracts/` é a fonte única dos tipos e schemas (zod) da API.** O cliente valida as respostas com eles, e os mocks os usam para montar e validar os dados (ADR-002). Uma divergência entre os dois vira erro de contrato, nunca um bug silencioso de UI.
- **`src/api/`** só faz transporte: não tem hooks nem dados fictícios. O mock acontece na camada de rede, então componentes, hooks e Axios não têm caminhos alternativos de negócio.
- **`src/mocks/`** simula o servidor:
  - estado persistido em `localStorage`;
  - sessões com token opaco, guardado apenas como hash SHA-256, e TTL;
  - senhas com hash salgado;
  - cenários de latência e falha;
  - controles `/api/__dev/*` para testes e demonstração.
- **`src/features/<domínio>/`** agrupa por domínio as query options, mutations, hooks e componentes: catálogo, início, detalhe, auth, carrinho, checkout, pedidos, favoritos, perfil, carteiras e tempo real.

### Boot

O `main.tsx` renderiza o app imediatamente e inicia o MSW em paralelo. As requisições do Axios e o socket esperam `whenNetworkReady()` (`src/api/network-ready.ts`), então nada sai antes de o worker controlar a página.

A query string inicial é capturada antes da primeira renderização, para que `?scenario=` não se perca quando o roteador canoniza a URL.

## 2. Estado e cache (TanStack Query) — ADR-004

| Dado | Query key | Escopo |
|---|---|---|
| Sessão | `['session']` | aba |
| Catálogo, destaque, detalhe, relacionados | `['catalog', …]`, com a query normalizada como último segmento | público |
| Carrinho e cotação | `['cart', 'user:<id>' \| 'guest:<uuid>', …]` | dono |
| Favoritos, perfil, carteiras, pedidos | `['user', userId, …]` | privado |

- **URL como fonte de verdade do catálogo.**
  - Busca, filtros, aba, ordenação e página ficam na URL, sem os valores padrão.
  - A URL é normalizada pelo contrato (listas ordenadas, ETH canônico) e vira a query key, então URLs equivalentes compartilham o mesmo cache.
  - Respostas de outra query são descartadas, o que protege contra respostas fora de ordem.
  - `keepPreviousData` mantém filtros e paginação visíveis durante a troca.
- **Cancelamento:** o `AbortSignal` do TanStack Query é repassado ao Axios.
- **Retry:** só para erros transitórios (rede, timeout, 429/5xx).
- **Atualização otimista com rollback:** favoritos (em caso de falha, o estado volta e a falha é anunciada).
- **Carrinho:**
  - não usa atualização otimista, porque os valores vêm só da cotação;
  - as mutations rodam em série (mesmo `scope`);
  - a resposta substitui o cache só se a versão não for mais antiga, então respostas fora de ordem nunca desfazem o carrinho.

## 3. Política de sessão — ADR-005

- **Login e cadastro:** retornam um bearer token opaco, guardado em `localStorage` (`kurio.session`). No boot, a sessão é revalidada (`GET /api/auth/session`), e as rotas protegidas (`/_authed`) revalidam no guard.
- **401 `SESSION_EXPIRED`** em qualquer chamada autenticada encerra a sessão como `expired`:
  - os caches privados são cancelados e removidos;
  - o usuário é levado a `/login?redirect=<url atual>&reason=expired`, onde vê um aviso;
  - depois do login, volta para a mesma URL.
- **O `redirect` é sanitizado:** só aceita caminhos relativos da mesma origem, com proteção contra `//evil.com` e normalização de segmentos `.`/`..`.
- **Logout e troca de usuário:** removem `['user']`, `['cart']` e `['session']` e recriam o socket. O rascunho e as tentativas de checkout seguem a tabela de `docs/API_CONTRACTS.md`. Uma expiração preserva a tentativa idempotente, para que ela seja retomada depois do re-login.
- **Limitação:** o token fica em `localStorage`, o que é aceitável para mock. Em produção seria um cookie `HttpOnly`.

## 4. Estado do carrinho — ADR-006

- **O carrinho vive no servidor simulado.** O do visitante é identificado por um UUID gerado no cliente (`X-Guest-Cart-Id`, persistido), e o do usuário pelo token. Por isso ele sobrevive a refresh.
- **No login, o carrinho do visitante é mesclado no do usuário de forma atômica:**
  - as quantidades são limitadas ao estoque e ao máximo por pedido;
  - os ajustes aparecem num aviso;
  - o id de visitante é descartado.
- **A cotação (`quote`) é ligada à versão do carrinho e expira em 5 minutos.**
  - Ao ser renovada, ela informa as mudanças de preço, disponibilidade, cupom e taxa.
  - O checkout exige aceitar explicitamente os novos valores antes de confirmar.
- **Valores em ETH** são strings decimais com aritmética big.js (ADR-003); nunca `number`.
- **Checkout idempotente:** a chave (`Idempotency-Key`) é persistida por tentativa.
  - Um clique repetido ou uma resposta perdida reutilizam a mesma chave e resultam no mesmo pedido.
  - O recibo é um snapshot imutável.
  - Os estados `confirmed` e `declined` são terminais.

## 5. Tempo real e reconciliação REST ↔ Socket.IO (P5-01)

- **Transporte:**
  - o app usa o `socket.io-client` real, com transporte `websocket` e path `/realtime/socket.io/`;
  - o MSW intercepta o WebSocket na página, e `src/mocks/realtime-server.ts` implementa o protocolo Engine.IO v4 / Socket.IO v5: handshake, `CONNECT` com `auth.token`, `CONNECT_ERROR` para token inválido ou expirado, ping/pong e eventos;
  - **não usamos o `@mswjs/socket.io-binding`** sugerido no README do desafio, porque ele responde `CONNECT` sem validar o token; a autenticação do handshake e as salas por usuário exigiam controlar o protocolo;
  - usamos um path dedicado porque o MSW remove um `/socket.io/` inicial antes de comparar URLs, e a origem pura também capturaria o WebSocket do HMR do Vite.
- **Origem dos eventos:** todo commit do banco simulado que incrementa a versão de um NFT ou pedido gera um evento. Isso inclui patch via dev, reserva ou liberação de estoque, resolução de pedido e reset. Por isso REST e eventos nunca divergem.
  - `nft.updated` vai para todos.
  - `order.updated` vai só para os sockets autenticados como o dono do pedido.
- **Cliente** (`src/features/realtime/`):
  - O envelope é validado com zod. Um `schemaVersion` desconhecido ou um payload inválido dispara reconciliação via REST.
  - Eventos duplicados são descartados pelo `eventId` (LRU de 500).
  - Um evento só é aplicado se `version > versão em cache`. Eventos antigos ou iguais são ignorados, incluindo os referentes ao carrinho, comparados com o `nftVersion` da cotação.
  - **`nft.updated`:**
    - atualiza todas as cópias do NFT (listas, destaque, relacionados, detalhe) e marca as listas como obsoletas, porque filtros e ordenação dependem do preço;
    - se o NFT está no carrinho, invalida o carrinho e a cotação; o resumo é reprecificado e, no checkout, a confirmação fica bloqueada até os novos valores serem aceitos;
    - anuncia a mudança numa região `aria-live` quando ela afeta o detalhe aberto ou o carrinho.
  - **`order.updated`:**
    - é ignorado se `userId` não for o usuário atual (evento de uma sessão anterior);
    - nunca regride um estado terminal e nunca altera o recibo;
    - quando o pedido é confirmado, atualiza o carrinho e a lista de pedidos.
  - **Um socket por sessão:** ele é recriado em login, logout, troca de usuário ou expiração, e os listeners são removidos no cleanup do efeito.
- **Reconexão:**
  - backoff de 0,5 a 2 s;
  - um banner `role="status"` aparece enquanto o socket está desconectado;
  - ao reconectar, o cliente invalida o catálogo, o carrinho, a cotação e os pedidos pendentes, e o REST prevalece.
  - O polling do pedido pendente (backoff de 1 a 5 s) continua como rede de segurança. Um pedido pendente sobrevive a refresh e a quedas sem gerar uma segunda compra.
- **Montagem adiada:** o bridge é montado em `requestIdleCallback`, para não competir com o primeiro paint.

## 6. Mocks e cenários — README §6

- **Seed determinístico:** NFTs com edições e redes variadas, 2 usuários de demonstração e carteiras.
- **Persistência:** `localStorage` (`kurio.mockDb`, com versão de schema).
- **Reset** (`POST /api/__dev/reset`): restaura o seed mantendo as versões de NFT monotônicas, para que clientes com cache mais novo aceitem o estado restaurado.
- **Cenários** (`?scenario=` ou `PUT /api/__dev/scenario`): `default`, `slow`, `variable-latency` (respostas fora de ordem, com seed), `server-error`, `offline` e `timeout`.
- **Controles de domínio:**
  - preço e estoque (`POST /api/__dev/nfts/:id`);
  - expiração de sessões;
  - resultado do pagamento (confirmar, recusar ou deixar pendente; atraso; perda da resposta);
  - resolução de pedido;
  - queda do tempo real (`PUT /api/__dev/realtime`);
  - injeção de eventos (`POST /api/__dev/realtime/emit`).

## 7. Limitações conhecidas

- **Cada aba roda seu próprio servidor simulado.** Uma mudança feita em outra aba chega por REST (refetch ou reconexão), não como evento.
- **O mock de Socket.IO** suporta um único namespace e não tem long-polling, binário, acks nem connection-state recovery; eventos perdidos são reconciliados por REST.
- **Desempenho no mobile:** o Lighthouse fica em 75–80. A análise e os próximos passos estão em [`docs/lighthouse/README.md`](docs/lighthouse/README.md). As causas são o SPA sem SSR, com um chunk de entrada de 510 kB, e o MSW no caminho crítico.
- **Os baselines visuais do Playwright são específicos da plataforma** (`-win32`). Uma CI em Linux precisa gerar os seus com `npm run e2e:update-snapshots`.

## 8. Decisões de UX

- **Recursos sem contrato de API aparecem como "em breve" (desabilitados), nunca com sucesso falso.** São eles:
  - login social;
  - "Esqueceu a senha?";
  - newsletter;
  - Mercado, Criadores e Aprenda;
  - os artigos do "Diário da Cunhagem".
- **Erros:**
  - têm mensagem por código, em português;
  - os de formulário ficam ligados ao campo (`aria-describedby`), e o foco vai para o primeiro campo inválido;
  - falhas de carregamento oferecem "Tentar novamente".
- **Skeletons com shimmer** preservam as dimensões, para evitar CLS, e respeitam `prefers-reduced-motion`.
- **Uma edição selecionada que esgota em tempo real** é trocada automaticamente por outra com estoque.
- **No mobile, o login e o cadastro são uma página inteira; no desktop, são um diálogo sobre a página anterior.** No desktop, o foco fica preso no diálogo e Esc fecha e volta.

## 9. Desvios do Figma

- **Sem tokens exatos:** o Figma foi recebido como 15 PNGs exportados (`docs/design/`), sem Dev Mode. Cores, espaçamentos e tipografia foram amostrados dos pixels (`docs/DESIGN_TOKENS.md`), então a paridade é visual, não de tokens.
- **No mobile, o detalhe do NFT mantém a barra de busca e a tab bar globais,** que o frame do Figma não mostra.
- **Acessibilidade:**
  - o anúncio em tempo real e o banner de reconexão não existem no Figma; foram acrescentados por acessibilidade e pelo requisito de feedback;
  - os rótulos de alguns ícones (favoritar, carrinho, zoom) são apenas acessíveis, para não alterar o layout.
