/**
 * Format structured tool response data as compact text for LLM consumption.
 * These run in the MCP layer only — the web app uses the raw objects.
 */

// ---------------------------------------------------------------------------
// Context: summary
// ---------------------------------------------------------------------------

type SummaryData = {
  node: { title: string; status: string; description: string };
  parent: { title: string; type: string } | null;
  edgeCount: Record<string, number>;
  edges: {
    edgeType: string;
    direction: string;
    connectedTaskId: string;
    connectedTaskTitle: string;
    connectedTaskStatus: string;
    note: string;
  }[];
  acceptanceCriteriaCount: number;
  decisionsCount: number;
  hasImplementationPlan: boolean;
};

export function formatSummary(data: SummaryData): string {
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
      const arrow = e.direction === "outgoing" ? "→" : "←";
      const note = e.note ? ` — "${e.note}"` : "";
      lines.push(`- ${e.edgeType} ${arrow} ${e.connectedTaskTitle} [${e.connectedTaskStatus}]${note}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Query: search
// ---------------------------------------------------------------------------

type SearchResult = {
  id: string;
  title: string;
  status: string;
  state: string;
  tags: string[];
  category: string | null;
};

type SearchData = {
  results: SearchResult[];
  _hints?: string[];
};

export function formatSearchResults(data: SearchData): string {
  const { results, _hints } = data;
  if (results.length === 0) return "No results found.";

  const lines: string[] = [`Found ${results.length} result${results.length > 1 ? "s" : ""}:\n`];

  for (const r of results) {
    const tags = r.tags.length > 0 ? ` tags: ${r.tags.join(", ")}` : "";
    const cat = r.category ? ` | ${r.category}` : "";
    lines.push(`- ${r.title} [${r.status}] \`${r.id}\`${tags}${cat} (state: ${r.state})`);
  }

  if (_hints && _hints.length > 0) {
    lines.push("");
    for (const h of _hints) lines.push(`_${h}_`);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Query: list
// ---------------------------------------------------------------------------

type TaskSlim = {
  id: string;
  title: string;
  status: string;
  tags: string[];
  category: string | null;
  order: number;
};

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

// ---------------------------------------------------------------------------
// Query: edges
// ---------------------------------------------------------------------------

type EdgeDetailed = {
  edgeId: string;
  edgeType: string;
  direction: string;
  note: string;
  connectedTask: { id: string; title: string; status: string };
};

export function formatEdges(data: EdgeDetailed[]): string {
  if (data.length === 0) return "No edges.";

  const lines: string[] = [`# Edges (${data.length})\n`];
  for (const e of data) {
    const arrow = e.direction === "outgoing" ? "→" : "←";
    const note = e.note ? ` — "${e.note}"` : "";
    lines.push(`- ${e.edgeType} ${arrow} ${e.connectedTask.title} [${e.connectedTask.status}] \`${e.edgeId}\`${note}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Query: overview
// ---------------------------------------------------------------------------

type OverviewData = {
  id: string;
  title: string;
  description: string;
  status: string;
  categories: string[];
  tasks: {
    id: string;
    title: string;
    status: string;
    description: string;
    order: number;
    tags: string[];
    category: string | null;
  }[];
  edges: {
    sourceTitle: string;
    targetTitle: string;
    edgeType: string;
    note: string;
  }[];
  totalTasks: number;
  doneTasks: number;
  inProgressTasks: number;
  progress: number;
};

export function formatOverview(data: OverviewData): string {
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
      const note = e.note ? ` — "${e.note}"` : "";
      lines.push(`- ${e.sourceTitle} --${e.edgeType}--> ${e.targetTitle}${note}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Analyze: ready / plannable
// ---------------------------------------------------------------------------

type TaggedTask = {
  id: string;
  title: string;
  status: string;
  tags: string[];
};

type TaggedTaskData = TaggedTask[] | { tasks: TaggedTask[]; _hints?: string[] };

function extractTaggedTasks(data: TaggedTaskData): { tasks: TaggedTask[]; hints: string[] } {
  if (Array.isArray(data)) return { tasks: data, hints: [] };
  return { tasks: data.tasks, hints: data._hints ?? [] };
}

export function formatReadyTasks(data: TaggedTaskData): string {
  const { tasks, hints } = extractTaggedTasks(data);
  return formatTaggedTaskList("Ready Tasks", tasks, hints);
}

export function formatPlannableTasks(data: TaggedTaskData): string {
  const { tasks, hints } = extractTaggedTasks(data);
  return formatTaggedTaskList("Plannable Tasks", tasks, hints);
}

function formatTaggedTaskList(heading: string, tasks: TaggedTask[], hints: string[]): string {
  const lines: string[] = [`# ${heading} (${tasks.length})\n`];

  if (tasks.length === 0 && hints.length > 0) {
    for (const h of hints) lines.push(`_${h}_`);
    return lines.join("\n");
  }

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

// ---------------------------------------------------------------------------
// Analyze: blocked
// ---------------------------------------------------------------------------

type BlockedTask = {
  id: string;
  title: string;
  status: string;
  blockedBy: { id: string; title: string; status: string }[];
};

export function formatBlockedTasks(data: BlockedTask[]): string {
  if (data.length === 0) return "# Blocked Tasks (0)\n\nNo blocked tasks.";

  const lines: string[] = [`# Blocked Tasks (${data.length})\n`];
  for (const t of data) {
    const blockers = t.blockedBy.map((b) => `${b.title} [${b.status}]`).join(", ");
    lines.push(`- ${t.title} [${t.status}] \`${t.id}\``);
    lines.push(`  blocked by: ${blockers}`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Analyze: downstream
// ---------------------------------------------------------------------------

type DownstreamNode = { id: string; depth: number };

export function formatDownstream(data: DownstreamNode[]): string {
  if (data.length === 0) return "# Downstream Tasks (0)\n\nNo downstream tasks.";

  const lines: string[] = [`# Downstream Tasks (${data.length})\n`];
  for (const d of data) {
    lines.push(`- \`${d.id}\` (depth ${d.depth})`);
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Analyze: critical_path
// ---------------------------------------------------------------------------

type CriticalPathTask = { id: string; title: string; status: string };

export function formatCriticalPath(data: CriticalPathTask[]): string {
  if (data.length === 0) return "# Critical Path (0 tasks)\n\nNo dependency chains found.";

  const lines: string[] = [`# Critical Path (${data.length} tasks)\n`];
  for (let i = 0; i < data.length; i++) {
    const t = data[i];
    lines.push(`${i + 1}. ${t.title} [${t.status}] \`${t.id}\``);
  }
  return lines.join("\n");
}
