# Kurio — NFT Marketplace (Jungle Gaming frontend challenge)

Marketplace de NFTs em React + TypeScript com API REST simulada (MSW) e eventos em tempo real (Socket.IO). Toda a "API" roda no navegador: não há backend, mas o frontend conversa com ela exatamente como conversaria com um servidor real (Axios → HTTP → MSW).

> **Status da entrega:** ver [Status por requisito](#status-por-requisito). Progresso detalhado em `docs/PROGRESS.md`, decisões em `docs/DECISIONS.md`.

## Stack
- React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/ui (Radix)
- TanStack Router (estado de catálogo na URL) e TanStack Query (cache, cancelamento, retry)
- Axios (instância única, validação zod nas respostas) + MSW (handlers REST com estado persistente)
- big.js para ETH (valores como strings decimais; nunca `number`)
- Socket.IO client (`socket.io-client`) sobre transporte simulado (slice P5, ver status)
- Vitest + Testing Library, Playwright (Chromium desktop e mobile)

## Como rodar
```bash
npm ci
npx playwright install chromium   # apenas para os testes e2e
npm run dev                       # http://localhost:5173
```
Build de produção: `npm run build && npm run preview`.

### Credenciais de demonstração (fictícias)
| Usuário | E-mail | Senha |
|---|---|---|
| Colecionador | `colecionador@kurio.test` | `Colecionador2026` |
| Criadora | `nova@kurio.test` | `NovaSato2026` |

Também é possível criar uma conta em `/cadastro`.

### Cenários da API simulada
Adicione `?scenario=<nome>` a qualquer URL (persistido no navegador; `?scenario=default` restaura):
`default`, `slow` (1,5 s), `variable-latency` (respostas fora de ordem), `server-error`, `offline`, `timeout`.
Endpoints de controle (usados pelos testes): `POST /api/__dev/reset` (restaura o seed), `PUT /api/__dev/scenario`, `POST /api/__dev/sessions/expire` (força expiração de sessão), `POST /api/__dev/nfts/:id` (altera preço/estoque).

## Qualidade
```bash
npm run typecheck && npm run lint
npm run test -- --run                  # unitários/integração
npm run e2e                            # Playwright, Chromium desktop + mobile
bash scripts/quality-gate.sh --full    # tudo acima + build
```

## Arquitetura (resumo)
- `src/contracts/` — schemas zod + tipos de toda a API (fonte única; documentação em `docs/API_CONTRACTS.md`).
- `src/api/` — transporte Axios; respostas 2xx validadas com zod; erros normalizados em `ApiError`.
- `src/mocks/` — servidor simulado: banco persistido em `localStorage`, sessões com token opaco + TTL, senhas com hash salgado, cenários de latência/falha.
- `src/features/<domínio>/` — query options, hooks e componentes por domínio (catálogo, home, detalhe, auth, carrinho, …).
- `src/routes/` — rotas file-based do TanStack Router.

Decisões principais (detalhes em `docs/DECISIONS.md`):
- **URL como fonte de verdade do catálogo** (busca, filtros, ordenação, página); query keys normalizadas e proteção contra respostas fora de ordem (ADR-004, ADR-007).
- **Isolamento por sessão**: chaves `['user', id]`, `['cart', owner]`; logout/expiração/troca de usuário cancelam e removem caches privados (ADR-004).
- **Sessão** com bearer token revalidado no boot e em rotas protegidas; 401 de sessão expirada redireciona para login preservando a URL; redirect sanitizado contra open redirect (ADR-005).
- **Carrinho de visitante no servidor** com merge atômico no login (ADR-006).
- **ETH decimal** com big.js (ADR-003).

## Status por requisito
| ID | Escopo | Status |
|---|---|---|
| R01 | Tecnologias exigidas | Feito |
| R02 | Páginas desktop/mobile | Início, Detalhe do NFT, Login, Cadastro, Perfil (mínimo) feitos; demais em andamento |
| R03 | Busca/filtros/ordenação/paginação na URL, corrida/vazio/erro | Feito |
| R04 | Carrinho, cupom, ETH decimal, merge do carrinho visitante | Em andamento |
| R05 | Checkout, revalidação de cotação, idempotência, recibo | Pendente |
| R06 | Auth, expiração de sessão, perfil, carteiras, isolamento | Auth/sessão/isolamento feitos; perfil/carteiras pendentes |
| R07 | REST tipado, cache, rollback otimista | Feito para catálogo/auth |
| R08 | MSW com estado, dois usuários, reset, falhas | Feito |
| R09 | Socket.IO com transporte simulado, versionamento, reconexão | Pendente |
| R10 | Fidelidade ao Figma, responsivo, skeletons, a11y | Feito nas páginas entregues |
| R11 | Grupos E2E | Parcial (catálogo, home, detalhe, auth) |
| R12 | Lighthouse | Pendente |
| R13 | Deploy público, refresh de rotas | `vercel.json` com rewrites SPA pronto; deploy pelo autor |

### Desvios conhecidos
- Login social, "Esqueceu a senha?", newsletter, Mercado/Criadores/Aprenda e artigos do "Diário da Cunhagem" não têm contrato de API: aparecem como "em breve" (sem sucesso falso).
- No mobile, a página de detalhe ainda mostra a barra de busca e a tab bar globais (o Figma não as exibe).
- Token de sessão em `localStorage` (aceitável para mock; em produção seria cookie `HttpOnly`).

## Deploy (Vercel)
Framework "Vite", build `npm run build`, output `dist`. O `vercel.json` reescreve todas as rotas para `index.html` (refresh direto em `/nft/...`, `/perfil` etc.) e serve `mockServiceWorker.js` sem cache. Os mocks ficam ativos por padrão (`VITE_ENABLE_MOCKS` ≠ `false`).

## Uso de IA
Desenvolvido com auxílio do Claude Code (agentes de implementação e revisão independente), com evidências de testes registradas por slice em `docs/tasks/`.
