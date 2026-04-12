import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleAnalyze } from "@/lib/ai/tool-handlers";
import type { ReadyTask, BlockedTask, DownstreamNode, CriticalPathTask } from "@/lib/ai/tool-handlers";
import { resolveProjectId } from "../state.js";
import { text, error } from "./helpers.js";
import {
  formatReadyTasks,
  formatBlockedTasks,
  formatDownstream,
  formatCriticalPath,
  formatPlannableTasks,
} from "./formatters.js";

function extractTasksWithHints<T>(data: unknown): { tasks: T[]; hints: string[] } {
  if (Array.isArray(data)) return { tasks: data as T[], hints: [] };
  const obj = data as { tasks: T[]; _hints?: string[] };
  return { tasks: obj.tasks, hints: obj._hints ?? [] };
}

/**
 * Register the mymir_analyze tool on the MCP server.
 * @param server - The MCP server instance.
 */
export function registerAnalyzeTool(server: McpServer): void {
  server.registerTool(
    "mymir_analyze",
    {
      description: DESCRIPTIONS.mymir_analyze,
      inputSchema: z.object({
        type: z.enum(["ready", "blocked", "downstream", "critical_path", "plannable"])
          .describe("ready=unblocked work, blocked=waiting tasks, downstream=impact, critical_path=bottleneck, plannable=draft tasks ready for planning"),
        taskId: z.string().optional()
          .describe("Task UUID. Required for 'downstream'"),
        projectId: z.string().optional()
          .describe("Project UUID (uses current if omitted). For ready/blocked/critical_path"),
      }),
      annotations: {
        title: "Analyze Graph",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ type, taskId, projectId }) => {
      try {
        const pid = type !== "downstream" ? resolveProjectId(projectId) : projectId;
        const result = await handleAnalyze({ type, taskId, projectId: pid });
        if (!result.ok) return error(result.error);

        switch (type) {
          case "ready": {
            const { tasks, hints } = extractTasksWithHints<ReadyTask>(result.data);
            return text(formatReadyTasks(tasks, hints));
          }
          case "blocked":
            return text(formatBlockedTasks(result.data as BlockedTask[]));
          case "downstream":
            return text(formatDownstream(result.data as DownstreamNode[]));
          case "critical_path":
            return text(formatCriticalPath(result.data as CriticalPathTask[]));
          case "plannable": {
            const { tasks, hints } = extractTasksWithHints<ReadyTask>(result.data);
            return text(formatPlannableTasks(tasks, hints));
          }
        }
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
