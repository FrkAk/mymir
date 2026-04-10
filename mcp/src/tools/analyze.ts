import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleAnalyze } from "@/lib/ai/tool-handlers";
import { resolveProjectId } from "../state.js";
import { text, error } from "./helpers.js";
import {
  formatReadyTasks,
  formatBlockedTasks,
  formatDownstream,
  formatCriticalPath,
  formatPlannableTasks,
} from "./formatters.js";

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

        const formatters = {
          ready: formatReadyTasks,
          blocked: formatBlockedTasks,
          downstream: formatDownstream,
          critical_path: formatCriticalPath,
          plannable: formatPlannableTasks,
        } as const;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return text((formatters[type] as any)(result.data));
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
