# Design tokens (P2-01)

Source: owner-exported PNG frames in `docs/design/` (no Figma Dev Mode). Values were sampled
pixel-exact with `sharp` (dominant colour in a box, frames are 1x: Desktop 1440 wide, Mobile 414
wide). Coordinates are `x,y,w,h` in frame pixels. Parity is visual, not token-exact: antialiased
text was sampled as the most frequent non-background colour inside the glyph box.

Tokens live in `src/index.css` as shadcn CSS variables (`:root`, dark-only, `<html class="dark">`)
and are exposed to Tailwind v4 through `@theme inline` (`bg-background`, `text-brand`, ...).

## Colour

| Token (CSS var / Tailwind) | Value | Role | Sample source |
|---|---|---|---|
| `--background` / `bg-background` | `#140d0a` | page background | Carrinho 20,20 (px); Início 900,64,200,8 |
| `--foreground` / `text-foreground` | `#f5f1eb` | primary text, nav, logo | Carrinho logo 120,35,50,12; nav "Início" 496,28,58,14 |
| `--card`, `--popover`, `--sidebar` | `#241612` | surfaces (footer, sidebar, cart rows, tab bar) | Carrinho 130,1200 (px); Mobile tab bar 0,800,414,96 |
| `--secondary`, `--muted`, `--accent` | `#38220f` | raised band (footer contact band), inputs on card, hover | Carrinho 965,1200,240,40; 300,1410 (px) |
| `--primary` / `bg-primary` | `#d28a4c` | buttons, badges, active underline, feature circles | Carrinho "Entrar" 1220,24,100,35; Início underline 480,60,80,10 |
| `--primary-foreground` | `#140d0a` | text/icons on orange | Carrinho "Entrar" glyphs 1252,34,56,14 |
| `--brand` / `text-brand` | `#e89b55` | orange text: active nav, prices, links | Carrinho nav "Mercado" 594,28,68,14; Mobile tab active 30,840,30,30 |
| `--muted-foreground` | `#cfb28c` | secondary/body text, inactive tab icons | Carrinho footer copy 168,1270,200,80; Mobile tab 100,840,40,40 |
| `--subtle-foreground` / `text-subtle-foreground` | `#b39463` | placeholders, token ids | Carrinho newsletter placeholder 975,1212,170,14; Mobile search 60,55,160,16 |
| `--border`, `--sidebar-border` | `#442c1a` | header rule, table dividers | Início 900,64,200,8; Carrinho 120,156 (px) |
| `--input` | `#3f2319` | form field borders | Perfil 458,188,417,40 |
| `--border-accent` / `border-border-accent` | `#915e36` | footer feature dividers | Carrinho 415,1160,4,190 |
| `--ring` | `#e89b55` | focus ring (`ring-ring`) | = brand (not shown in frames; chosen for ≥3:1 on all surfaces) |
| `--destructive` | `#f0805f` | required asterisk / errors | Perfil 604,154,14,14 |
| filter/center action gradient | `#d28a4c → #a66d3c` | mobile filter button, tab bar center action | Mobile 345,40,46,46 |

### Contrast (WCAG 2.x, computed from the hex values)

| Text \ surface | background `#140d0a` | card `#241612` | secondary `#38220f` | primary `#d28a4c` |
|---|---|---|---|---|
| foreground `#f5f1eb` | 17.10 | 15.57 | 13.29 | 2.50 (not used) |
| muted-foreground `#cfb28c` | 9.53 | 8.68 | 7.41 | — |
| subtle-foreground `#b39463` | 6.72 | 6.12 | 5.22 | — |
| brand `#e89b55` | 8.47 | 7.72 | 6.59 | — |
| primary as text `#d28a4c` | 6.85 | 6.24 | 5.33 | — |
| primary-foreground `#140d0a` | — | — | — | 6.85 |

All text pairs used pass AA (4.5:1). Unavailable entries are dimmed with `opacity-70`
(foreground at 70% on background ≈ 9:1, still AA).

## Typography

| Token | Value | Notes |
|---|---|---|
| `--font-sans`, `--font-mono` | `"Roboto Mono Variable", ui-monospace, …` | self-hosted via `@fontsource-variable/roboto-mono` (weights 100–700, `font-display: swap`, woff2 per unicode-range) |
| nav | 15px, tracking 0.04em, active bold | Início 496,28 (text box ≈ 58px for 6 glyphs) |
| logo "KURIO" | 14px bold, tracking 0.12em | Carrinho 120,35 |
| footer body/links | 14px, no tracking, line-height 1.6 | "Feito para colecionadores," = 217px / 26 glyphs = 0.6em advance |
| footer headings | 18px bold | "Meu perfil" = 108px / 10 glyphs |
| feature titles | 16px bold, tracking 0.04em | "Segurança da carteira" = 214px / 21 glyphs |

**Why Roboto Mono:** the frames use a monospace with a *slashed* zero (`0.016 ETH`, `0,02`,
Carrinho/Confirmação), double-storey `a`, flat-topped `t` and narrow
proportions (0.6em advance). Space Mono (geometric, dotted-style zero, very different `a`/`g`),
JetBrains Mono (dotted zero, taller x-height) and IBM Plex Mono (dotted zero, slab serifs on `i`/`l`)
do not match; Roboto Mono matches the zero, `a`, `g`, `ç` and advance width, and is the default
monospace Figma offers. Hero "EXPLORAR" button text looks like proportional Roboto; it is out of
this slice (P2-02).

## Radius and spacing

| Token | Value | Source |
|---|---|---|
| `--radius` (`rounded-lg`), `rounded-sm` | 0.25rem / 0.15rem | "Entrar" button 1220,24,100,35 (≈4px corners) |
| `--radius-card` (`rounded-card`) | 1rem | catalog art corners (Login 1071,1074 grid card) |
| mobile search / filter | `rounded-xl` (≈12px) | Mobile 24,40,312,44 |
| tab bar top corners | 2rem | Mobile 0,800,414,96 |
| content width | 75rem (1200px), 120px gutters at 1440 | header rule 120→1320 |
| header height | 68px (rule at y=67) | Início 120,60,1200,10 |
| footer columns | features 249/266/266/1fr from x=168 (dividers at x=417/683/949); link + contact columns at x=152/455/757/1060 | Carrinho 1120–1700 |
| mobile page gutter | 24px | Mobile 24,40 |
| tab bar height | `--tab-bar-height: 4.5rem` + `env(safe-area-inset-bottom)` | Mobile 0,800,414,96 |

## NFT art (`public/nfts/*.webp`)

Cropped from the frames (inset past the rounded corners so no background leaks in), WebP q85.

| Art key | Source frame / rect (x,y,size) | Output | Bytes |
|---|---|---|---|
| `emerald-ape` | Desktop/Início hero 870,101,450 (inset 10) | 430×430 | 26 888 |
| `sage-nomad` | Desktop/Login grid 780,1499,250 (inset 7) | 236×236 | 7 322 |
| `ivory-baron` | Desktop/Login grid 1071,1074,250 (inset 7) | 236×236 | 6 770 |
| `golden-beat` | Desktop/Login grid 1071,1490,250 (inset 7) | 236×236 | 9 260 |

Gaps: the frames contain only these four characters. Fixture rows that originally used
`onyx-scholar`/`amber-pilot` were remapped to the four available keys, and fixtures declare the
real file sizes (emerald-ape 430x430, others 236x236; frames are 1x exports, so art is soft on 2x screens).

Deliberate deviation: out-of-scope links (Mercado, Criadores, Aprenda, most footer links) render at 70%
opacity with `aria-disabled` and an "(em breve)" accessible suffix; the frames show them at full brightness.
