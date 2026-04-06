#!/usr/bin/env bun
import { loadEnvLocal } from "./env.js";

loadEnvLocal();

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAllTools } from "./tools/index.js";

const server = new McpServer(
  { name: "trellis", version: "0.2.0" },
  {
    instructions: [
      "Trellis is a persistent context network for coding projects. It tracks tasks, dependencies, decisions, and implementation records across sessions.",
      "",
      "## Session Start",
      "1. `trellis_project action='list'` → `action='select'` → set current project",
      "2. `trellis_query type='overview'` → see all tasks, progress, and dependencies",
      "",
      "## Find Work",
      "- `trellis_analyze type='ready'` → unblocked tasks (pick from these first)",
      "- If none ready: `trellis_analyze type='plannable'` → draft tasks that need implementation plans",
      "- `trellis_analyze type='critical_path'` → prioritize tasks on the bottleneck chain",
      "",
      "## Implement a Task",
      "1. Claim: `trellis_task action='update' status='in_progress'` (prevents double-assignment)",
      "2. Get context: `trellis_context depth='agent'` (multi-hop deps + execution records)",
      "3. Do the work",
      "4. Record: `trellis_task action='update' status='done'` with ALL of:",
      "   - `executionRecord`: 3-5 sentences on what was built (function names, file paths, endpoints)",
      "   - `decisions`: one-liner per technical choice (CHOICE + WHY)",
      "   - `files`: every file created or modified",
      "   These feed downstream tasks — skipping them breaks the context chain.",
      "",
      "## Plan a Draft Task",
      "1. `trellis_context depth='planning'` → spec, prerequisites, related work",
      "2. Write detailed plan (file paths, line numbers, specific changes, verification steps)",
      "3. `trellis_task action='update' implementationPlan='<full plan>' status='planned'`",
      "",
      "## Create a Task",
      "1. `trellis_task action='create'` with title (verb+noun), description, acceptanceCriteria, tags",
      "2. `trellis_edge action='create'` to connect it into the graph",
      "3. `trellis_query type='edges'` to verify edges look correct",
      "",
      "## Edges (Dependencies & Relationships)",
      "Edges are what make Trellis a context *network* — they drive ready/blocked analysis, critical path, and agent context propagation.",
      "- `depends_on`: source CANNOT start without target done first (source needs target's code, APIs, or decisions)",
      "- `relates_to`: tasks share context but neither blocks the other",
      "- When in doubt: removing target makes source impossible → depends_on. Just harder → relates_to.",
      "- Always include a `note` explaining WHY the relationship exists — notes propagate to downstream agent context.",
      "- After completing a task: `trellis_query type='edges'` + `trellis_analyze type='downstream'` → check if downstream task descriptions, edge notes, or dependencies need updating based on decisions made.",
      "",
      "## Hints",
      "Tool responses may include `_hints` with contextual guidance — always read and follow them.",
      "",
      "## Full Workflows",
      "Invoke `/trellis` skill for: dispatching to multiple agents, propagating changes through the graph, resuming sessions, refining tasks, and complex dependency management.",
    ].join("\n"),
  },
);

registerAllTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);
