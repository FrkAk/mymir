import { z } from "zod/v4";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DESCRIPTIONS, handleQuery } from "@/lib/ai/tool-handlers";
import type { SearchResult, TaskSlim, DetailedEdge, ProjectOverview } from "@/lib/ai/tool-handlers";
import { resolveProjectId } from "../state.js";
import { text, error } from "./helpers.js";
import {
  formatSearchResults,
  formatTaskList,
  formatEdges,
  formatOverview,
} from "./formatters.js";

/**
 * Register the mymir_query tool on the MCP server.
 * @param server - The MCP server instance.
 */
export function registerQueryTool(server: McpServer): void {
  server.registerTool(
    "mymir_query",
    {
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.object({
        type: z.enum(["search", "list", "edges", "overview"])
          .describe("search=find by name or tag, list=all tasks, edges=task relationships, overview=project structure"),
        query: z.string().optional()
          .describe("Search string for type='search' — matches against task titles and tags"),
        taskId: z.string().optional()
          .describe("Task UUID for type='edges'"),
        projectId: z.string().optional()
          .describe("Project UUID (uses current if omitted)"),
      }),
      annotations: {
        title: "Query Tasks",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ type, query, taskId, projectId }) => {
      try {
        const pid = type !== "edges" ? resolveProjectId(projectId) : projectId;
        const result = await handleQuery({ type, query, taskId, projectId: pid });
        if (!result.ok) return error(result.error);

        switch (type) {
          case "search": {
            const { results, _hints } = result.data as { results: SearchResult[]; _hints?: string[] };
            return text(formatSearchResults(results, _hints));
          }
          case "list":
            return text(formatTaskList(result.data as TaskSlim[]));
          case "edges":
            return text(formatEdges(result.data as DetailedEdge[]));
          case "overview":
            return text(formatOverview(result.data as ProjectOverview));
        }
      } catch (e) {
        return error(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
