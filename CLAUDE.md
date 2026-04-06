# CLAUDE.md

## Package Manager

**Always use Bun** — never npm, npx, yarn, or node.

## Commands

- `bun run dev` — dev server with Turbopack (localhost:3000)
- `bun run build` — production build
- `bun run lint` — ESLint
- `bun run typecheck` — TypeScript type checking
- `bun run db:push` — push Drizzle schema to database
- `bun run db:generate` — generate Drizzle migrations
- `bun run db:studio` — open Drizzle Studio
- `bun run db:setup` — start Postgres + push schema (first time / schema changes)
- `docker compose up -d` — start Postgres only

## Environment

- `DATABASE_URL` — PostgreSQL connection string (required)
- `GOOGLE_GENERATIVE_AI_API_KEY` — default LLM provider (required)
- `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `OLLAMA_BASE_URL` — optional providers
- See `.env.local.example` for template

## Tech Stack

- Next.js 15 (App Router, Turbopack), TypeScript strict, React 19
- PostgreSQL via Neon (serverless) or local Docker, Drizzle ORM
- Vercel AI SDK (`ai` package) — streaming chat, tool calling, multi-provider
- Tailwind CSS v4 — CSS-first config via `@theme` in `app/globals.css`
- Motion (`motion/react`) for animations, d3-force + Canvas for graph viz
- Zod for AI tool parameter validation

## Architecture

- **Graph data model**: Flat hierarchy — Project > Tasks. Tasks are connected via `task_edges` table with typed relationships. Categories group tasks into drawers (one per task, defined at project level); tags are freeform for filtering.
- **MCP plugin** (`mcp/`): 6 consolidated tools (`trellis_project`, `trellis_task`, `trellis_edge`, `trellis_query`, `trellis_context`, `trellis_analyze`). 3 agents (brainstorm, decompose, manage). 1 skill (trellis).
- **AI tools**: defined in `lib/ai/tools.ts`. Each chat scope (brainstorm, decompose, refine, projectChat) gets a different tool subset. Refine scope hard-wires `updateTask` to a single task.
- **CRI levels** (`lib/context/`): Summary (0-hop, UI cards), Working (1-hop ~4000 tokens, AI assistant), Agent (multi-hop deps, token-dense for coding agents), Planning (spec-focused for pre-implementation).
- **Shared types**: all domain types in `lib/types.ts`, not co-located.
- **DB client** (`lib/db/index.ts`): lazy proxy — defers connection until first use so builds work without `DATABASE_URL`.
- **Settings**: LLM provider/model/apiKey stored in client-side localStorage; server falls back to env vars.
- **Next.js standalone output** for Docker. Server actions body limit: 2MB.
- **TopBar offset**: fixed 56px + 1px gradient = 57px. Pages use `pt-[58px]`.

## Task Statuses

`draft` → `planned` → `in_progress` → `done`

## Edge Types

`depends_on`, `relates_to`

Direction matters: `depends_on` source→target means source NEEDS target done first.

## Design System

Defined in `app/globals.css` via Tailwind `@theme`. Supports **dark mode** (default) and **light mode** (toggled via `html.light` class, persisted in localStorage as `trellis-theme`).

### Fonts

- `font-display` — Playfair Display (serif) — headings, project names
- `font-body` — DM Sans (sans-serif) — main text
- `font-mono` — JetBrains Mono — code, IDs, technical details

### Colors (Dark)

- Base: `#0a0e13`, Surface: `#12171e`, Surface-raised: `#1a2029`, Surface-hover: `#232b38`
- Text: primary `#e8edf4`, secondary `#7d8694`, muted `#4a5568`
- Accent: `#e09100`, Accent-light: `#ffc233`
- Borders: `rgba(255,255,255,0.05)` / `rgba(255,255,255,0.10)`

### Colors (Light)

- Base: `#f4f1ec` (warm paper beige), Surface: `#ffffff`, Surface-raised: `#f0ede8`
- Text: primary `#1a1a1a`
- Accent: `#c47d00` (darker orange)
- Borders: `rgba(0,0,0,0.12)` / `rgba(0,0,0,0.20)`

### Status Colors

- Done: `#10b981` (green), In Progress: `#f59e0b` (amber), Planned: `#22d3ee` (cyan), Draft: `#64748b` (slate)

### Edge Colors

- depends_on: `#818cf8` (indigo), relates_to: `#a78bfa` (purple)

### Border Radius

- `--radius-sm: 8px`, `--radius-md: 12px`, `--radius-lg: 16px`, `--radius-xl: 24px`

### CSS Utilities

- `.text-gradient` — orange-to-red gradient text for hero headings
- `.glow-card` — animated gradient border on hover (orange-to-indigo)
- `.animated-border` — animated border effect
- Atmosphere layers (dark only): radial amber/indigo glow, 48px grid overlay, SVG noise texture

## Gotchas

- Deleting a task cascades to all its edges — preview first via `trellis_task action='delete'` (defaults to preview mode).
- Gemini rate limiting: free tier is 15 RPM — app targets 12 RPM with 5s min spacing and exponential backoff on 429s (`lib/ai/rate-limiter.ts`).
- Conversations are merged per-turn (append user + assistant), keyed by `(projectId, taskId)`.
- Working context auto-truncates by priority (header > criteria > decisions > edges > siblings > conversation) to fit ~4000 tokens.
- Critical path and dependency analysis use recursive SQL CTEs (`lib/graph/traversal.ts`).

## Pre-production

Breaking changes are acceptable — no backwards-compatibility shims needed.

## Trellis MCP Plugin

Use `/trellis` skill or trellis MCP tools for project management: tracking tasks, dependencies, decisions, and implementation records. The MCP server provides instructions automatically when connected. For full workflow guidance (picking tasks, planning, dispatching agents, propagating changes), invoke `/trellis`.

## Specs

- `product_spec.md` — product specification (data model, CRI, AI tools, flows)
- `ui_spec.md` — UI/UX design specification (screens, components, interactions, animations)
