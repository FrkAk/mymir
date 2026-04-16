import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
  DESCRIPTIONS,
  handleProject,
  handleTask,
  handleEdge,
  handleQuery,
  handleContext,
  handleAnalyze,
} from "@/lib/ai/tool-handlers";
import type { ToolResult } from "@/lib/ai/tool-handlers";
import {
  projectSchema,
  taskSchema,
  edgeSchema,
  querySchema,
  contextSchema,
  analyzeSchema,
} from "@/lib/api/mcp-schemas";

/**
 * Format a successful tool result as MCP content.
 * @param data - Result data from a tool handler.
 * @returns MCP content response.
 */
function json(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

/**
 * Format an error as MCP content.
 * @param message - Error message.
 * @returns MCP error response.
 */
function err(message: string) {
  return { content: [{ type: "text" as const, text: message }], isError: true as const };
}

/**
 * Convert a ToolResult to MCP response format.
 * Handles string results (context depths) as raw text.
 * @param result - Tool handler result.
 * @returns MCP content response.
 */
function toMcp(result: ToolResult) {
  if (!result.ok) return err(result.error);
  if (typeof result.data === "string") {
    return { content: [{ type: "text" as const, text: result.data }] };
  }
  return json(result.data);
}

const INSTRUCTIONS = [
  "Mymir is a persistent context network for coding projects. It tracks tasks, dependencies, decisions, and implementation records across sessions.",
  "",
  "## Session Start",
  "1. `mymir_project action='list'` → pick a project → `action='select' projectId='...'` → note the projectId",
  "2. `mymir_query type='overview' projectId='...'` → see all tasks, progress, and dependencies",
  "3. Pass projectId explicitly on every subsequent call — there is no server-side session state.",
  "",
  "## Find Work",
  "- `mymir_analyze type='ready'` → unblocked tasks (pick from these first)",
  "- If none ready: `mymir_analyze type='plannable'` → draft tasks that need implementation plans",
  "- `mymir_analyze type='critical_path'` → prioritize tasks on the bottleneck chain",
  "",
  "## Implement a Task",
  "1. Claim: `mymir_task action='update' status='in_progress'` (prevents double-assignment)",
  "2. Get context: `mymir_context depth='agent'` (multi-hop deps + execution records)",
  "3. Do the work",
  "4. Record: `mymir_task action='update' status='done'` with ALL of:",
  "   - `executionRecord`: 3-5 sentences on what was built (function names, file paths, endpoints)",
  "   - `decisions`: one-liner per technical choice (CHOICE + WHY)",
  "   - `files`: every file created or modified",
  "   These feed downstream tasks — skipping them breaks the context chain.",
  "",
  "## Plan a Draft Task",
  "1. `mymir_context depth='planning'` → spec, prerequisites, related work",
  "2. Write detailed plan (file paths, line numbers, specific changes, verification steps)",
  "3. `mymir_task action='update' implementationPlan='<full plan>' status='planned'`",
  "",
  "## Create a Task",
  "1. `mymir_task action='create'` with title (verb+noun), description, acceptanceCriteria, tags",
  "2. `mymir_edge action='create'` to connect it into the graph",
  "3. `mymir_query type='edges'` to verify edges look correct",
  "",
  "## Edges (Dependencies & Relationships)",
  "Edges are what make Mymir a context *network* — they drive ready/blocked analysis, critical path, and agent context propagation.",
  "- `depends_on`: source CANNOT start without target done first (source needs target's code, APIs, or decisions)",
  "- `relates_to`: tasks share context but neither blocks the other",
  "- When in doubt: removing target makes source impossible → depends_on. Just harder → relates_to.",
  "- Always include a `note` explaining WHY the relationship exists — notes propagate to downstream agent context.",
  "- After completing a task: `mymir_query type='edges'` + `mymir_analyze type='downstream'` → check if downstream task descriptions, edge notes, or dependencies need updating based on decisions made.",
  "",
  "## Hints",
  "Tool responses may include `_hints` with contextual guidance — always read and follow them.",
  "",
  "## Full Workflows",
  "Invoke `/mymir` skill for: dispatching to multiple agents, propagating changes through the graph, resuming sessions, refining tasks, and complex dependency management.",
  "",
  "## Remote Mode",
  "This is a stateless HTTP endpoint — no session state is persisted server-side.",
  "The `select` action on mymir_project returns a confirmation but does not set server state — always pass projectId explicitly on subsequent calls.",
].join("\n");

/**
 * Register all 6 Mymir tools on a server instance.
 * Extracted so createMcpServer and external tooling can reuse it.
 * @param server - Any object with a registerTool method (McpServer or mock).
 */
export function registerAllTools(server: McpServer): void {
  server.registerTool(
    "mymir_project",
    {
      description: DESCRIPTIONS.mymir_project,
      inputSchema: projectSchema,
      annotations: {
        title: "Manage Project",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        if (params.action === "select") {
          return json({
            selected: params.projectId,
            _hints: ["Stateless mode — pass this projectId explicitly on every subsequent call."],
          });
        }
        return toMcp(await handleProject(params));
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_task",
    {
      description: DESCRIPTIONS.mymir_task,
      inputSchema: taskSchema,
      annotations: {
        title: "Manage Task",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleTask(params);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_edge",
    {
      description: DESCRIPTIONS.mymir_edge,
      inputSchema: edgeSchema,
      annotations: {
        title: "Manage Edge",
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleEdge(params);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_query",
    {
      description: DESCRIPTIONS.mymir_query,
      inputSchema: querySchema,
      annotations: {
        title: "Query Tasks",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleQuery(params);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_context",
    {
      description: DESCRIPTIONS.mymir_context,
      inputSchema: contextSchema,
      annotations: {
        title: "Get Task Context",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleContext(params);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    "mymir_analyze",
    {
      description: DESCRIPTIONS.mymir_analyze,
      inputSchema: analyzeSchema,
      annotations: {
        title: "Analyze Graph",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (params) => {
      try {
        const result = await handleAnalyze(params);
        return toMcp(result);
      } catch (e) {
        return err(e instanceof Error ? e.message : String(e));
      }
    },
  );
}

/**
 * Create a stateless MCP server with all 6 Mymir tools registered.
 * No session state — callers must always pass projectId explicitly.
 * @returns Configured McpServer instance.
 */
export function createMcpServer(): McpServer {
  const server = new McpServer(
    { name: "mymir", version: "1.0.0" },
    { instructions: INSTRUCTIONS },
  );
  registerAllTools(server);
  return server;
}
