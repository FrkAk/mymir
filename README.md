# Trellis

A structured development process platform. Walks developers through **Brainstorm → Decompose → Refine → Plan → Execute → Track** — the same process real engineering teams follow, powered by AI.

The AI decomposes your idea into phases, modules, and tasks, builds a context network of relationships, and generates token-dense context packages for your coding agent.

## Quick Start

Requires [Bun](https://bun.sh) (v1.0+) and [Docker](https://docs.docker.com/get-docker/) (for PostgreSQL).

```bash
git clone git@github.com:FrkAk/trellis.git
cd trellis
bun install
cp .env.local.example .env.local
```

Fill in `.env.local`:

```bash
DATABASE_URL=postgresql://trellis:trellis@localhost:5432/trellis
GOOGLE_GENERATIVE_AI_API_KEY=your-key
```

Start Postgres and push the schema:

```bash
docker compose up -d
bun run db:setup
```

Start the dev server:

```bash
bun run dev
```

Open [localhost:3000](http://localhost:3000)

Code changes are picked up instantly via Turbopack hot reload — no container rebuild needed.

## Routes

| Route | What |
| --- | --- |
| `/` | Project grid |
| `/new/brainstorm` | Describe idea → AI asks clarifying questions |
| `/new/decompose` | AI breaks idea into phases/modules/tasks |
| `/new/review` | Confirm structure → enter workspace |
| `/project/[id]` | Two-panel workspace: navigator + detail (refine/plan/context/history) |
| `/settings` | LLM provider configuration |

## Stack

Next.js 15, TypeScript, PostgreSQL, Drizzle ORM, Vercel AI SDK, Gemini Flash, Tailwind CSS v4, Motion

## Claude Code Plugin

Trellis ships as a Claude Code plugin — a self-contained package that gives Claude persistent project memory.

### How it works

The plugin connects Claude to a **graph database** that stores your project's architecture: phases, modules, tasks, dependencies, and decisions. Claude reads and writes to this graph through 24 MCP tools. The data persists across sessions — you decompose once, then pick up where you left off every time.

The plugin has four parts:

```text
mcp/
├── .claude-plugin/plugin.json   # Plugin manifest (name, version, description)
├── .mcp.json                    # Starts the MCP server (stdio transport → PostgreSQL)
├── agents/                      # 3 agents: brainstorm, decompose, manage
├── skills/trellis/SKILL.md      # Auto-invocation: Claude loads Trellis when relevant
└── src/                         # MCP server (24 tools wrapping the graph layer)
```

- **MCP server** (`src/`) — A stdio server that exposes graph operations as tools. It imports the existing `lib/graph/` and `lib/context/` code directly — same database, same queries, same schema as the web UI. No data duplication.
- **Agents** (`agents/`) — Markdown files that teach Claude how to behave in each mode. Brainstorm explores ideas, decompose creates the graph, manage handles day-to-day navigation and refinement.
- **Skill** (`skills/trellis/`) — An auto-invocation trigger. Claude sees the skill description at session start and activates Trellis when the conversation matches (project planning, task management, progress) without the user typing a command.
- **Manifest** (`.claude-plugin/plugin.json`) — Standard Claude Code plugin metadata. Enables `--plugin-dir` loading and future marketplace distribution.

### Prerequisites

- PostgreSQL running (via `bun run db:setup` or `docker compose up -d`)
- [Bun](https://bun.sh) installed

### Install

```bash
cd mcp && bun install
```

### Use with Claude Code

```bash
claude --plugin-dir ./mcp
```

This gives you:

| Component | What |
| --- | --- |
| **24 MCP tools** | `trellis_*` — full graph CRUD, traversal, context retrieval |
| **Brainstorm agent** | Explore project ideas through structured conversation |
| **Decompose agent** | Break a project into phases, modules, and tasks |
| **Manage agent** | Navigate, refine, track progress, restructure |
| **Trellis skill** | Auto-invokes when you talk about project planning |

### Quick test

Once Claude Code loads the plugin, try:

```text
What projects do I have in Trellis?
```

Or start fresh:

```text
I want to build a habit tracking app
```

The skill auto-detects project planning and activates Trellis tools.

### Agents

Invoke directly with `/agents` in Claude Code:

- **brainstorm** — "I have an idea for an app..."
- **decompose** — "Break this project into tasks"
- **manage** — "What should I work on next?"

## Docs

- [`product_spec.md`](product_spec.md) — Product specification
- [`ui_spec.md`](ui_spec.md) — UI/UX design specification

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup instructions and PR guidelines.

## License

Trellis is licensed under [AGPL-3.0](LICENSE). A commercial license is also available — see [LICENSING.md](LICENSING.md) for details.
