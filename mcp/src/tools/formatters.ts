/**
 * Format structured tool response data as compact text for LLM consumption.
 * These run in the MCP layer only — the web app uses the raw objects.
 */

import type {
  SummaryContext,
  SearchResult,
  TaskSlim,
  DetailedEdge,
  ProjectOverview,
  ReadyTask,
  PlannableTask,
  BlockedTask,
  DownstreamNode,
  CriticalPathTask,
} from "@/lib/ai/tool-handlers";

/**
 * Format a task summary context as compact markdown.
 * @param data - Summary context from buildSummaryContext.
 * @returns Formatted markdown string with task info, stats, and edges.
 */
export function formatSummary(data: SummaryContext): string {
  const { node, parent, edgeCount, edges, acceptanceCriteriaCount, decisionsCount, hasImplementationPlan } = data;
  const lines: string[] = [];

  lines.push(`# ${node.title} [${node.status}]`);
  if (parent) lines.push(`Project: ${parent.title}`);
  if (node.description) lines.push(`\n${node.description}`);

  const stats = [
    `Edges: ${edgeCount.depends_on} depends_on, ${edgeCount.relates_to} relates_to`,
    `Criteria: ${acceptanceCriteriaCount}`,
    `Decisions: ${decisionsCount}`,
    `Plan: ${hasImplementationPlan ? "yes" : "no"}`,
  ];
  lines.push(`\n${stats.join(" | ")}`);

  if (edges.length > 0) {
    lines.push("\n## Edges");
    for (const e of edges) {
      const arrow = e.direction === "outgoing" ? "\u2192" : "\u2190";
      const note = e.note ? ` \u2014 "${e.note}"` : "";
      lines.push(`- ${e.edgeType} ${arrow} ${e.connectedTaskTitle} [${e.connectedTaskStatus}]${note}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format search results as a bulleted list.
 * @param results - Matching tasks.
 * @param hints - Optional contextual hints to append.
 * @returns Formatted markdown string with matching tasks.
 */
export function formatSearchResults(results: SearchResult[], hints: string[] = []): string {
  if (results.length === 0) return "No results found.";

  const lines: string[] = [`Found ${results.length} result${results.length > 1 ? "s" : ""}:\n`];

  for (const r of results) {
    const tags = r.tags.length > 0 ? ` tags: ${r.tags.join(", ")}` : "";
    const cat = r.category ? ` | ${r.category}` : "";
    lines.push(`- ${r.title} [${r.status}] \`${r.id}\`${tags}${cat} (state: ${r.state})`);
  }

  if (hints.length > 0) {
    lines.push("");
    for (const h of hints) lines.push(`_${h}_`);
  }

  return lines.join("\n");
}

/**
 * Format a slim task list as a numbered list.
 * @param data - Array of slim task objects.
 * @returns Formatted markdown string with all tasks.
 */
export function formatTaskList(data: TaskSlim[]): string {
  if (data.length === 0) return "No tasks.";

  const lines: string[] = [`# Tasks (${data.length})\n`];
  for (let i = 0; i < data.length; i++) {
    const t = data[i];
    const tags = t.tags.length > 0 ? ` tags: ${t.tags.join(", ")}` : "";
    const cat = t.category ? ` | ${t.category}` : "";
    lines.push(`${i + 1}. ${t.title} [${t.status}] \`${t.id}\`${tags}${cat}`);
  }
  return lines.join("\n");
}

/**
 * Format detailed edges as a bulleted list.
 * @param data - Array of detailed edge objects.
 * @returns Formatted markdown string with edge details.
 */
export function formatEdges(data: DetailedEdge[]): string {
  if (data.length === 0) return "No edges.";

  const lines: string[] = [`# Edges (${data.length})\n`];
  for (const e of data) {
    const arrow = e.direction === "outgoing" ? "\u2192" : "\u2190";
    const note = e.note ? ` \u2014 "${e.note}"` : "";
    lines.push(`- ${e.edgeType} ${arrow} ${e.connectedTask.title} [${e.connectedTask.status}] \`${e.edgeId}\`${note}`);
  }
  return lines.join("\n");
}

/**
 * Format a full project overview with tasks, edges, and progress stats.
 * @param data - Project overview object.
 * @returns Formatted markdown string with project structure.
 */
export function formatOverview(data: ProjectOverview): string {
  const lines: string[] = [];

  lines.push(`# ${data.title} [${data.status}]`);
  lines.push(`Progress: ${data.doneTasks}/${data.totalTasks} done (${data.progress}%), ${data.inProgressTasks} in progress`);

  if (data.categories.length > 0) {
    lines.push(`Categories: ${data.categories.join(", ")}`);
  }

  if (data.tasks.length > 0) {
    lines.push("\n## Tasks");
    for (const t of data.tasks) {
      const check = t.status === "done" ? "x" : " ";
      const status = t.status === "done" ? "" : ` [${t.status}]`;
      const tags = t.tags.length > 0 ? ` tags: ${t.tags.join(", ")}` : "";
      const cat = t.category ? ` | ${t.category}` : "";
      lines.push(`- [${check}] ${t.title}${status}${tags}${cat}`);
    }
  }

  if (data.edges.length > 0) {
    lines.push("\n## Edges");
    for (const e of data.edges) {
      const note = e.note ? ` \u2014 "${e.note}"` : "";
      lines.push(`- ${e.sourceTitle} --${e.edgeType}--> ${e.targetTitle}${note}`);
    }
  }

  return lines.join("\n");
}

/**
 * Format ready (unblocked) tasks as a bulleted list.
 * @param tasks - Array of ready tasks.
 * @param hints - Optional contextual hints to append.
 * @returns Formatted markdown string with ready tasks.
 */
export function formatReadyTasks(tasks: ReadyTask[], hints: string[] = []): string {
  return formatTasksWithHints("Ready Tasks", tasks, hints);
}

/**
 * Format plannable (draft) tasks as a bulleted list.
 * @param tasks - Array of plannable tasks.
 * @param hints - Optional contextual hints to append.
 * @returns Formatted markdown string with plannable tasks.
 */
export function formatPlannableTasks(tasks: PlannableTask[], hints: string[] = []): string {
  return formatTasksWithHints("Plannable Tasks", tasks, hints);
}

function formatTasksWithHints(heading: string, tasks: ReadyTask[], hints: string[]): string {
  if (tasks.length === 0) {
    const base = `No ${heading.toLowerCase()}.`;
    if (hints.length === 0) return base;
    return base + "\n\n" + hints.map((h) => `_${h}_`).join("\n");
  }

  const lines: string[] = [`# ${heading} (${tasks.length})\n`];

  for (const t of tasks) {
    const tags = t.tags.length > 0 ? ` tags: ${t.tags.join(", ")}` : "";
    lines.push(`- ${t.title} [${t.status}] \`${t.id}\`${tags}`);
  }

  if (hints.length > 0) {
    lines.push("");
    for (const h of hints) lines.push(`_${h}_`);
  }

  return lines.join("\n");
}

/**
 * Format blocked tasks with their blocker details.
 * @param data - Array of blocked task objects with blockedBy info.
 * @returns Formatted markdown string with blocked tasks and blockers.
 */
export function formatBlockedTasks(data: BlockedTask[]): string {
  if (data.length === 0) return "No blocked tasks.";

  const lines: string[] = [`# Blocked Tasks (${data.length})\n`];
  for (const t of data) {
    const blockers = t.blockedBy.map((b) => `${b.title} [${b.status}]`).join(", ");
    lines.push(`- ${t.title} [${t.status}] \`${t.id}\``);
    lines.push(`  blocked by: ${blockers}`);
  }
  return lines.join("\n");
}

/**
 * Format downstream (impacted) tasks as a bulleted list.
 * @param data - Array of downstream nodes with depth.
 * @returns Formatted markdown string with downstream tasks.
 */
export function formatDownstream(data: DownstreamNode[]): string {
  if (data.length === 0) return "No downstream tasks.";

  const lines: string[] = [`# Downstream Tasks (${data.length})\n`];
  for (const d of data) {
    lines.push(`- \`${d.id}\` (depth ${d.depth})`);
  }
  return lines.join("\n");
}

/**
 * Format the critical path (longest dependency chain) as a numbered list.
 * @param data - Ordered array of tasks forming the critical path.
 * @returns Formatted markdown string with the critical path.
 */
export function formatCriticalPath(data: CriticalPathTask[]): string {
  if (data.length === 0) return "No dependency chains found.";

  const lines: string[] = [`# Critical Path (${data.length} tasks)\n`];
  for (let i = 0; i < data.length; i++) {
    const t = data[i];
    lines.push(`${i + 1}. ${t.title} [${t.status}] \`${t.id}\``);
  }
  return lines.join("\n");
}
