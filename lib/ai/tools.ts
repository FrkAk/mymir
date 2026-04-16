/**
 * AI SDK tool definitions for the Mymir web app.
 * 6 consolidated tools matching MCP design. Each scope function restricts
 * which actions are available via narrowed discriminated-union branches.
 */

import { z } from "zod/v4";
import { tool } from "ai";
import {
  DESCRIPTIONS,
  handleProject,
  handleTask,
  handleEdge,
  handleQuery,
  handleContext,
  handleAnalyze,
  type ToolResult,
} from "./tool-handlers";
import {
  projectUpdate,
  taskCreate,
  taskUpdate,
  taskDelete,
  taskReorder,
  edgeCreate,
  edgeUpdate,
  edgeRemove,
  querySearch,
  queryList,
  queryEdges,
  queryOverview,
  contextSummary,
  contextWorking,
  contextAgent,
  contextPlanning,
  analyzeReady,
  analyzeBlocked,
  analyzeDownstream,
  analyzeCriticalPath,
  analyzePlannable,
} from "@/lib/api/mcp-schemas";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Unwrap a ToolResult for AI SDK — return data on success, throw on failure.
 * @param result - Handler result.
 * @returns The result data.
 * @throws Error with the failure message.
 */
function unwrap(result: ToolResult): unknown {
  if (!result.ok) throw new Error(result.error);
  return result.data;
}

// ---------------------------------------------------------------------------
// Brainstorm scope
// ---------------------------------------------------------------------------

/**
 * Build tools for the brainstorm scope.
 * @param projectId - UUID of the project being brainstormed.
 * @returns Tool set with project update and brainstorm completion signal.
 */
export function brainstormTools(projectId: string) {
  return {
    mymir_project: tool({
      description:
        "Update the project's name and description after brainstorming is complete. " +
        "Description should be 3-5 sentences covering: problem, target user, core features, tech direction, constraints.",
      inputSchema: projectUpdate.omit({ projectId: true }),
      execute: async (params) =>
        unwrap(await handleProject({ ...params, projectId })),
    }),
    signalBrainstormComplete: tool({
      description:
        "Signal that brainstorming is complete and the project is ready for decomposition. " +
        "Call this ONLY after you have explored all 6 topics and named the project via mymir_project. " +
        "This activates the 'Proceed' button in the UI.",
      inputSchema: z.object({
        summary: z.string().describe("Brief summary of what was decided during brainstorming"),
      }),
      execute: async ({ summary }) => ({ ready: true, summary }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Decompose scope
// ---------------------------------------------------------------------------

/**
 * Build tools for the decompose scope.
 * @param projectId - UUID of the project.
 * @returns Tool set for creating tasks and edges.
 */
export function decomposeTools(projectId: string) {
  return {
    mymir_task: tool({
      description: DESCRIPTIONS.mymir_task,
      inputSchema: z.discriminatedUnion("action", [
        taskCreate.omit({ projectId: true }),
        taskUpdate,
      ]),
      execute: async (params) =>
        unwrap(
          await handleTask(
            params.action === "create" ? { ...params, projectId } : params,
          ),
        ),
    }),
    mymir_edge: tool({
      description: DESCRIPTIONS.mymir_edge,
      inputSchema: z.discriminatedUnion("action", [edgeCreate, edgeUpdate]),
      execute: async (params) => unwrap(await handleEdge(params)),
    }),
    mymir_query: tool({
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.discriminatedUnion("type", [
        querySearch.omit({ projectId: true }),
        queryOverview.omit({ projectId: true }),
      ]),
      execute: async (params) => unwrap(await handleQuery({ ...params, projectId })),
    }),
    mymir_context: tool({
      description: DESCRIPTIONS.mymir_context,
      inputSchema: contextWorking.omit({ projectId: true }),
      execute: async (params) =>
        unwrap(await handleContext({ ...params, projectId })),
    }),
  };
}

// ---------------------------------------------------------------------------
// Refine scope (scoped to a single task)
// ---------------------------------------------------------------------------

/**
 * Build tools for the refine scope. mymir_task is hardwired to the selected task.
 * @param taskId - UUID of the task being refined.
 * @param projectId - UUID of the project.
 * @returns Tool set with scoped task update and graph exploration.
 */
export function refineScopedTools(taskId: string, projectId: string) {
  return {
    mymir_task: tool({
      description:
        `Update fields on the currently selected task (ID: ${taskId}). ` +
        "Pass only the fields you want to change. " +
        "Use this to refine descriptions, add acceptance criteria, record decisions, or change status. " +
        "Array fields (decisions, acceptanceCriteria, files) APPEND by default. Set overwriteArrays=true to replace entirely.",
      inputSchema: taskUpdate.omit({ action: true, taskId: true }),
      execute: async (params) =>
        unwrap(await handleTask({ action: "update", taskId, ...params })),
    }),
    mymir_edge: tool({
      description: DESCRIPTIONS.mymir_edge,
      inputSchema: z.discriminatedUnion("action", [edgeCreate, edgeRemove]),
      execute: async (params) => unwrap(await handleEdge(params)),
    }),
    mymir_query: tool({
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.discriminatedUnion("type", [
        querySearch.omit({ projectId: true }),
        queryEdges,
        queryOverview.omit({ projectId: true }),
      ]),
      execute: async (params) =>
        unwrap(
          await handleQuery(
            params.type === "edges" ? params : { ...params, projectId },
          ),
        ),
    }),
    mymir_context: tool({
      description: DESCRIPTIONS.mymir_context,
      inputSchema: contextWorking.omit({ projectId: true }),
      execute: async (params) =>
        unwrap(await handleContext({ ...params, projectId })),
    }),
    mymir_analyze: tool({
      description: DESCRIPTIONS.mymir_analyze,
      inputSchema: z.discriminatedUnion("type", [
        analyzeReady.omit({ projectId: true }),
        analyzeBlocked.omit({ projectId: true }),
        analyzeDownstream,
        analyzePlannable.omit({ projectId: true }),
      ]),
      execute: async (params) =>
        unwrap(
          await handleAnalyze(
            params.type === "downstream" ? params : { ...params, projectId },
          ),
        ),
    }),
  };
}

// ---------------------------------------------------------------------------
// Project chat scope (full access)
// ---------------------------------------------------------------------------

/**
 * Build the full tool set for project-level chat.
 * @param projectId - UUID of the project.
 * @returns All 6 tools with all actions.
 */
export function allTools(projectId: string) {
  return {
    mymir_project: tool({
      description: DESCRIPTIONS.mymir_project,
      inputSchema: projectUpdate.omit({ projectId: true }),
      execute: async (params) =>
        unwrap(await handleProject({ ...params, projectId })),
    }),
    mymir_task: tool({
      description: DESCRIPTIONS.mymir_task,
      inputSchema: z.discriminatedUnion("action", [
        taskCreate.omit({ projectId: true }),
        taskUpdate,
        taskDelete,
        taskReorder,
      ]),
      execute: async (params) =>
        unwrap(
          await handleTask(
            params.action === "create" ? { ...params, projectId } : params,
          ),
        ),
    }),
    mymir_edge: tool({
      description: DESCRIPTIONS.mymir_edge,
      inputSchema: z.discriminatedUnion("action", [
        edgeCreate,
        edgeUpdate,
        edgeRemove,
      ]),
      execute: async (params) => unwrap(await handleEdge(params)),
    }),
    mymir_query: tool({
      description: DESCRIPTIONS.mymir_query,
      inputSchema: z.discriminatedUnion("type", [
        querySearch.omit({ projectId: true }),
        queryList.omit({ projectId: true }),
        queryEdges,
        queryOverview.omit({ projectId: true }),
      ]),
      execute: async (params) =>
        unwrap(
          await handleQuery(
            params.type === "edges" ? params : { ...params, projectId },
          ),
        ),
    }),
    mymir_context: tool({
      description: DESCRIPTIONS.mymir_context,
      inputSchema: z.discriminatedUnion("depth", [
        contextSummary,
        contextWorking.omit({ projectId: true }),
        contextAgent,
        contextPlanning,
      ]),
      execute: async (params) =>
        unwrap(
          await handleContext(
            params.depth === "working" ? { ...params, projectId } : params,
          ),
        ),
    }),
    mymir_analyze: tool({
      description: DESCRIPTIONS.mymir_analyze,
      inputSchema: z.discriminatedUnion("type", [
        analyzeReady.omit({ projectId: true }),
        analyzeBlocked.omit({ projectId: true }),
        analyzeDownstream,
        analyzeCriticalPath.omit({ projectId: true }),
        analyzePlannable.omit({ projectId: true }),
      ]),
      execute: async (params) =>
        unwrap(
          await handleAnalyze(
            params.type === "downstream" ? params : { ...params, projectId },
          ),
        ),
    }),
  };
}
