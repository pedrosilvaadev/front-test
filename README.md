# Kurio — NFT Marketplace (Jungle Gaming frontend challenge)

Marketplace de NFTs em React e TypeScript, com uma API REST simulada (MSW) e eventos em tempo real (Socket.IO).

Toda a "API" roda no navegador. Não há backend, mas o frontend conversa com ela exatamente como conversaria com um servidor real:

- **REST:** Axios → HTTP → service worker do MSW.
- **Tempo real:** `socket.io-client` → WebSocket interceptado pelo MSW.

Documentação:

- [`ARCHITECTURE.md`](ARCHITECTURE.md): arquitetura, sessão, carrinho, cache, reconciliação REST ↔ Socket.IO, limitações, decisões de UX e desvios do Figma.
- [`docs/API_CONTRACTS.md`](docs/API_CONTRACTS.md): contratos REST e eventos.
- [`docs/DECISIONS.md`](docs/DECISIONS.md): ADRs.
- [`docs/lighthouse/`](docs/lighthouse/README.md): auditoria Lighthouse.
- [`docs/PROGRESS.md`](docs/PROGRESS.md) e `docs/tasks/`: evidências por entrega.

## Stack
- React 19, TypeScript, Vite, Tailwind CSS v4 e shadcn/ui (Radix).
- TanStack Router (estado do catálogo na URL) e TanStack Query (cache, cancelamento, retry).
- Axios, com uma instância única e respostas validadas com zod (`src/contracts`).
- MSW: handlers REST com estado persistente e simulação do protocolo Socket.IO.
- `socket.io-client`.
- big.js para valores em ETH, que são strings decimais e nunca `number`.
- Vitest e Testing Library; Playwright (Chromium desktop e mobile, axe-core, regressão visual); Lighthouse.

## Setup
Requer Node 22 e npm.

```bash
npm ci
npx playwright install chromium   # apenas para os testes e2e
npm run dev                       # http://localhost:5173 (com mocks)
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Desenvolvimento com mocks (MSW e Socket.IO simulado) |
| `npm run build` / `npm run preview` | Build otimizado (com mocks: é o build de demonstração) e servidor local |
| `npm run typecheck` / `npm run lint` | Verificação de tipos / ESLint |
| `npm run test -- --run` | Testes unitários e de integração (Vitest) |
| `npm run e2e` | Playwright em Chromium desktop e mobile, com relatório HTML em `playwright-report/` e traces das falhas em `test-results/` |
| `npm run e2e:update-snapshots` | Regenera os baselines visuais (`e2e/__screenshots__/`) |
| `npm run lighthouse` | Lighthouse: 3 execuções × 2 páginas × 2 perfis, com medianas em `docs/lighthouse/` (rodar depois de `npm run build`) |
| `bash scripts/quality-gate.sh [--full]` | typecheck + lint + testes + build (`--full` inclui o e2e) |

### Variáveis de ambiente
Todas são opcionais e não secretas (detalhes em `docs/ENVIRONMENT.md`). Para sobrescrever, use `.env.local`.

| Variável | Padrão | Uso |
|---|---|---|
| `VITE_ENABLE_MOCKS` | ligado | `false` desliga o MSW (não há backend real) |
| `VITE_API_BASE_URL` | `/api` | Base do Axios |
| `VITE_API_TIMEOUT_MS` | `10000` | Timeout das requisições |

### Credenciais de demonstração (fictícias)
| Usuário | E-mail | Senha |
|---|---|---|
| Colecionador (tem carteira MetaMask principal) | `colecionador@kurio.test` | `Colecionador2026` |
| Criadora | `nova@kurio.test` | `NovaSato2026` |

Também é possível criar uma conta em `/cadastro`.

Cupons:
- `KURIO10`: 10% de desconto;
- `LANCAMENTO`: 0.5 ETH de desconto;
- `EXPIRADO`: rejeitado como expirado.

Qualquer outro código é rejeitado como inválido.

## Cenários e reset da API simulada
- **Rede:** adicione `?scenario=<nome>` a qualquer URL. A escolha fica persistida no navegador; `?scenario=default` restaura.
  - `default`
  - `slow` (1,5 s)
  - `variable-latency` (respostas fora de ordem)
  - `server-error`
  - `offline`
  - `timeout`
- **Reset:** `POST /api/__dev/reset` restaura o seed (banco, cenário e tempo real). Também dá para limpar o `localStorage` do site.

### Como reproduzir os fluxos de falha
Os controles abaixo são chamados com `fetch` do próprio navegador, por exemplo no console do DevTools, na aba da aplicação.

| Fluxo | Como reproduzir |
|---|---|
| Lentidão, skeletons, respostas fora de ordem | `?scenario=slow` ou `?scenario=variable-latency` e filtrar o catálogo rapidamente |
| Erro 5xx, offline e timeout com "Tentar novamente" | `?scenario=server-error`, `offline` ou `timeout`; depois `?scenario=default` e clicar em tentar novamente |
| Sessão expirada | Logado: `fetch('/api/__dev/sessions/expire',{method:'POST'})` e navegar para `/perfil` → login com aviso → volta |
| Preço alterado ou edição esgotada durante a compra (Socket.IO) | Com o NFT no carrinho ou no checkout: `fetch('/api/__dev/nfts/nft_001',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({price:'1.5'})})`; para esgotar, use `editions:[{id:'nft_001-1of50',available:0}]` |
| Pagamento recusado ou pendente | `fetch('/api/__dev/checkout',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderOutcome:'decline'})})`; `'pending'` deixa o pedido pendente e `resolveDelayMs` define o atraso |
| Timeout depois da criação do pedido (recuperação por idempotência) | `PUT /api/__dev/checkout` com `{dropNextOrderResponses:1}` e confirmar duas vezes: o resultado é um único pedido |
| Queda do tempo real e reconexão | `fetch('/api/__dev/realtime',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({online:false})})` → banner "Reconectando…"; altere algo e depois `{online:true}`: o REST é reconciliado |
| Resolver um pedido pendente | `POST /api/__dev/orders/<id>/resolve` com `{status:'confirmed'\|'declined'}` |
| Evento duplicado ou antigo | `POST /api/__dev/realtime/emit` com um envelope `nft.updated` (ver `docs/API_CONTRACTS.md`) |

## Testes
- **Unitários e de integração:** 411 testes (Vitest).
- **E2E (Playwright):**
  - cobre os 12 grupos do README do desafio em Chromium desktop (1440×900) e mobile (Pixel 7);
  - o mapa grupo → spec está em [`docs/tasks/P6-01.md`](docs/tasks/P6-01.md);
  - cada teste parte de um estado isolado (reset do mock);
  - os de REST passam pelos handlers do MSW e os de tempo real pelo `socket.io-client`;
  - a varredura axe (WCAG 2.1 AA) cobre 9 telas;
  - há regressão visual de início, detalhe, carrinho e pagamento.

## Lighthouse (medianas de 3 execuções)
| Página | Perfil | Perf. | A11y | Best Pr. | SEO |
|---|---|---:|---:|---:|---:|
| Início | mobile | 75 | 100 | 100 | 100 |
| Início | desktop | 98 | 100 | 100 | 100 |
| Detalhe | mobile | 80 | 100 | 100 | 100 |
| Detalhe | desktop | 99 | 100 | 100 | 100 |

O desempenho no mobile fica abaixo da meta de 90. As causas (SPA sem SSR, chunk de entrada de 510 kB e MSW no caminho crítico), as medidas tomadas, LCP/CLS/TBT e os próximos passos estão em [`docs/lighthouse/README.md`](docs/lighthouse/README.md).

## Deploy (Vercel)
- **Configuração:** framework "Vite", build `npm run build`, output `dist`.
- **Rotas:** o `vercel.json` reescreve as rotas da SPA para `index.html`, então acesso direto e refresh funcionam em `/nft/...`, `/perfil` etc.
- **Service worker:** `mockServiceWorker.js` é servido sem cache.
- **Mocks e tempo real:** ficam ativos no build publicado.

## Uso de IA
Desenvolvido com auxílio do Claude Code: implementação por fatias, com gates (tipos, lint, testes, build e e2e) e evidências registradas em `docs/tasks/`. Há uma revisão independente ao final (ADR-009).
