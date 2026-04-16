/**
 * Shared discriminated-union Zod schemas for the 6 Mymir tools.
 *
 * Single source of truth imported by both `lib/ai/tools.ts` (AI SDK) and
 * `lib/mcp/create-server.ts` (MCP SDK) so per-action required fields are
 * enforced at the schema layer and errors surface as structured field-level
 * issues instead of flat handler strings.
 *
 * Array fields (`acceptanceCriteria`, `decisions`) accept plain strings —
 * `lib/graph/mutations.ts` normalizes them into `AcceptanceCriterion` and
 * `Decision` objects.
 */

import { z } from "zod/v4";

/**
 * Build a UUID field with a recovery hint.
 * The message applies to both missing (`invalid_type`) and malformed
 * (`invalid_format`) issues.
 *
 * @param hint - Short instruction pointing the agent at a recovery action.
 * @returns Zod validator requiring UUID format with the custom message.
 */
const uuidField = (hint: string) =>
  z.uuid({ error: `Must be a valid UUID — ${hint}` });

/**
 * Build a required non-empty string field with a recovery hint.
 * The single message applies to missing, non-string, and empty inputs.
 *
 * @param hint - Short instruction explaining what to pass.
 * @returns Zod validator requiring a non-empty string.
 */
const requiredString = (hint: string) =>
  z.string({ error: hint }).min(1, { error: hint });

/**
 * Build a required non-negative integer field with a recovery hint.
 *
 * @param hint - Short instruction explaining the expected value.
 * @returns Zod validator requiring an integer ≥ 0.
 */
const requiredInt = (hint: string) =>
  z
    .number({ error: hint })
    .int({ error: hint })
    .nonnegative({ error: hint });

/**
 * Build an error map for discriminated-union tools that turns the default
 * `"Invalid input"` message into a list of valid discriminator values.
 *
 * @param discriminator - Name of the discriminator key (e.g. "action").
 * @param values - Valid values for the discriminator.
 * @returns Zod error map usable as the `error` param on `discriminatedUnion`.
 */
const unionError = (discriminator: string, values: readonly string[]) =>
  () => `Unknown ${discriminator} — valid values are: ${values.join(", ")}`;

/**
 * Task UUID with a hint pointing to `mymir_query type='search'`.
 *
 * @returns Zod UUID validator.
 */
const taskIdField = () =>
  uuidField("use mymir_query type='search' to find task IDs");

/**
 * Project UUID with a hint pointing to `mymir_project action='list'`.
 *
 * @returns Zod UUID validator.
 */
const projectIdField = () =>
  uuidField("use mymir_project action='list' to see project IDs");

/**
 * Edge UUID with a hint pointing to `mymir_query type='edges'`.
 *
 * @returns Zod UUID validator.
 */
const edgeIdField = () =>
  uuidField("use mymir_query type='edges' with a taskId to see current edge IDs");

const taskStatusEnum = z
  .enum(["draft", "planned", "in_progress", "done"])
  .describe("Task lifecycle status");

const projectStatusEnum = z
  .enum(["brainstorming", "decomposing", "active", "archived"])
  .describe("Project lifecycle: brainstorming → decomposing → active → archived");

const edgeTypeEnum = z
  .enum(["depends_on", "relates_to"])
  .describe("depends_on = source needs target done first. relates_to = informational link");

const categoriesField = z
  .array(z.string())
  .describe("Task categories for drawer grouping (e.g. ['backend', 'frontend'])");

const acceptanceCriteriaField = z
  .array(z.string())
  .describe("2-4 testable done conditions (plain strings — server normalizes)");

const decisionsField = z
  .array(z.string())
  .describe("Key technical decisions — one-liner CHOICE + WHY (plain strings — server normalizes)");

const filesField = z.array(z.string()).describe("File paths this task touches");

const tagsField = z.array(z.string()).describe("Freeform filter tags");

export const projectList = z.object({
  action: z.literal("list"),
});

export const projectCreate = z.object({
  action: z.literal("create"),
  title: requiredString("title is required — short project name (2-5 words)"),
  description: z
    .string()
    .optional()
    .describe("3-5 sentence brief: problem, user, features, tech direction, constraints"),
  categories: categoriesField.optional(),
});

export const projectSelect = z.object({
  action: z.literal("select"),
  projectId: projectIdField().describe("Project UUID to select as the working project"),
});

export const projectUpdate = z.object({
  action: z.literal("update"),
  projectId: projectIdField(),
  title: z.string().min(1).optional().describe("Short project name (1-5 words)"),
  description: z.string().optional().describe("3-5 sentence brief"),
  status: projectStatusEnum.optional(),
  categories: categoriesField.optional(),
});

export const projectSchema = z.discriminatedUnion(
  "action",
  [projectList, projectCreate, projectSelect, projectUpdate],
  { error: unionError("action", ["list", "create", "select", "update"]) },
);

export const taskCreate = z.object({
  action: z.literal("create"),
  projectId: projectIdField(),
  title: requiredString("title is required — short verb+noun task name"),
  description: requiredString(
    "description is required — 2-4 sentences: what to build, why it matters, and key technical approach",
  ),
  status: taskStatusEnum.optional(),
  acceptanceCriteria: acceptanceCriteriaField.optional(),
  decisions: decisionsField.optional(),
  tags: tagsField.optional(),
  category: z.string().optional().describe("Drawer group. Should match a project category."),
  files: filesField.optional(),
  implementationPlan: z
    .string()
    .optional()
    .describe("Implementation plan written during planning phase"),
  executionRecord: z
    .string()
    .optional()
    .describe("Summary of what was built during implementation"),
  order: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe("0-based initial position"),
});

export const taskUpdate = z.object({
  action: z.literal("update"),
  taskId: taskIdField(),
  title: z.string().min(1).optional(),
  description: z.string().min(1).optional(),
  status: taskStatusEnum.optional(),
  acceptanceCriteria: acceptanceCriteriaField.optional(),
  decisions: decisionsField.optional(),
  tags: tagsField.optional(),
  category: z.string().optional(),
  files: filesField.optional(),
  implementationPlan: z.string().optional(),
  executionRecord: z.string().optional(),
  overwriteArrays: z
    .boolean()
    .optional()
    .describe("true=replace decisions/acceptanceCriteria/files entirely. Default false=append"),
});

export const taskDelete = z.object({
  action: z.literal("delete"),
  taskId: taskIdField(),
  preview: z
    .boolean()
    .optional()
    .describe("true=show impact (default), false=actually delete"),
});

export const taskReorder = z.object({
  action: z.literal("reorder"),
  taskId: taskIdField(),
  order: requiredInt("order is required — 0-based integer position"),
});

export const taskSchema = z.discriminatedUnion(
  "action",
  [taskCreate, taskUpdate, taskDelete, taskReorder],
  { error: unionError("action", ["create", "update", "delete", "reorder"]) },
);

export const edgeCreate = z.object({
  action: z.literal("create"),
  sourceTaskId: taskIdField().describe("Source task UUID — the dependent task"),
  targetTaskId: taskIdField().describe("Target task UUID — the dependency"),
  edgeType: edgeTypeEnum,
  note: z
    .string()
    .optional()
    .describe("Why this relationship exists — propagates to downstream agent context"),
});

export const edgeUpdate = z.object({
  action: z.literal("update"),
  edgeId: edgeIdField(),
  edgeType: edgeTypeEnum.optional(),
  note: z.string().optional(),
});

export const edgeRemove = z.object({
  action: z.literal("remove"),
  edgeId: edgeIdField().optional(),
  sourceTaskId: taskIdField().optional(),
  targetTaskId: taskIdField().optional(),
  edgeType: edgeTypeEnum.optional(),
});

export const edgeSchema = z.discriminatedUnion(
  "action",
  [edgeCreate, edgeUpdate, edgeRemove],
  { error: unionError("action", ["create", "update", "remove"]) },
);

export const querySearch = z.object({
  type: z.literal("search"),
  projectId: projectIdField(),
  query: requiredString(
    "query is required — search string that matches task titles and tags",
  ),
});

export const queryList = z.object({
  type: z.literal("list"),
  projectId: projectIdField(),
});

export const queryEdges = z.object({
  type: z.literal("edges"),
  taskId: taskIdField(),
});

export const queryOverview = z.object({
  type: z.literal("overview"),
  projectId: projectIdField(),
});

export const querySchema = z.discriminatedUnion(
  "type",
  [querySearch, queryList, queryEdges, queryOverview],
  { error: unionError("type", ["search", "list", "edges", "overview"]) },
);

export const contextSummary = z.object({
  depth: z.literal("summary"),
  taskId: taskIdField(),
});

export const contextWorking = z.object({
  depth: z.literal("working"),
  taskId: taskIdField(),
  projectId: projectIdField(),
});

export const contextAgent = z.object({
  depth: z.literal("agent"),
  taskId: taskIdField(),
});

export const contextPlanning = z.object({
  depth: z.literal("planning"),
  taskId: taskIdField(),
});

export const contextSchema = z.discriminatedUnion(
  "depth",
  [contextSummary, contextWorking, contextAgent, contextPlanning],
  { error: unionError("depth", ["summary", "working", "agent", "planning"]) },
);

export const analyzeReady = z.object({
  type: z.literal("ready"),
  projectId: projectIdField(),
});

export const analyzeBlocked = z.object({
  type: z.literal("blocked"),
  projectId: projectIdField(),
});

export const analyzeDownstream = z.object({
  type: z.literal("downstream"),
  taskId: taskIdField(),
});

export const analyzeCriticalPath = z.object({
  type: z.literal("critical_path"),
  projectId: projectIdField(),
});

export const analyzePlannable = z.object({
  type: z.literal("plannable"),
  projectId: projectIdField(),
});

export const analyzeSchema = z.discriminatedUnion(
  "type",
  [
    analyzeReady,
    analyzeBlocked,
    analyzeDownstream,
    analyzeCriticalPath,
    analyzePlannable,
  ],
  {
    error: unionError("type", [
      "ready",
      "blocked",
      "downstream",
      "critical_path",
      "plannable",
    ]),
  },
);

export type ProjectInput = z.infer<typeof projectSchema>;
export type TaskInput = z.infer<typeof taskSchema>;
export type EdgeInput = z.infer<typeof edgeSchema>;
export type QueryInput = z.infer<typeof querySchema>;
export type ContextInput = z.infer<typeof contextSchema>;
export type AnalyzeInput = z.infer<typeof analyzeSchema>;
