import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  index,
  unique,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type {
  ProjectStatus,
  TaskStatus,
  EdgeType,
  Message,
  Decision,
  HistoryEntry,
  AcceptanceCriterion,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  identifier: text("identifier").notNull().unique("projects_identifier_unique"),
  description: text("description").notNull().default(""),
  status: text("status").$type<ProjectStatus>().notNull().default("brainstorming"),
  categories: jsonb("categories").$type<string[]>().notNull().default([]),
  history: jsonb("history").$type<HistoryEntry[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Project = typeof projects.$inferSelect;
export type NewProject = typeof projects.$inferInsert;

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export const tasks = pgTable(
  "tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sequenceNumber: integer("sequence_number").notNull(),
    description: text("description").notNull().default(""),
    status: text("status").$type<TaskStatus>().notNull().default("draft"),
    order: integer("order").notNull().default(0),
    category: text("category"),
    acceptanceCriteria: jsonb("acceptance_criteria")
      .$type<AcceptanceCriterion[]>()
      .notNull()
      .default([]),
    decisions: jsonb("decisions").$type<Decision[]>().notNull().default([]),
    implementationPlan: text("implementation_plan"),
    executionRecord: text("execution_record"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    files: jsonb("files").$type<string[]>().notNull().default([]),
    history: jsonb("history").$type<HistoryEntry[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("tasks_project_id_idx").on(t.projectId),
    unique("tasks_project_sequence_unique").on(t.projectId, t.sequenceNumber),
  ],
);

export type Task = typeof tasks.$inferSelect;
export type NewTask = typeof tasks.$inferInsert;

// ---------------------------------------------------------------------------
// Task Edges
// ---------------------------------------------------------------------------

export const taskEdges = pgTable(
  "task_edges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceTaskId: uuid("source_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    targetTaskId: uuid("target_task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    edgeType: text("edge_type").$type<EdgeType>().notNull(),
    note: text("note").notNull().default(""),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_edges_source_idx").on(t.sourceTaskId),
    index("task_edges_target_idx").on(t.targetTaskId),
    uniqueIndex("task_edges_unique_idx").on(t.sourceTaskId, t.targetTaskId, t.edgeType),
  ],
);

export type TaskEdge = typeof taskEdges.$inferSelect;
export type NewTaskEdge = typeof taskEdges.$inferInsert;

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
    messages: jsonb("messages").$type<Message[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_project_id_idx").on(t.projectId),
    index("conversations_task_id_idx").on(t.taskId),
  ],
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

// ---------------------------------------------------------------------------
// Task Links (GitHub PRs)
// ---------------------------------------------------------------------------

export const taskLinks = pgTable(
  "task_links",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    number: integer("number").notNull(),
    state: text("state").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
    prId: integer("pr_id").notNull(),
    repoFullName: text("repo_full_name").notNull(),
    previousTaskStatus: text("previous_task_status").$type<TaskStatus>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("task_links_task_id_idx").on(t.taskId),
    unique("task_links_pr_task_unique").on(t.prId, t.taskId),
  ],
);

export type TaskLink = typeof taskLinks.$inferSelect;
export type NewTaskLink = typeof taskLinks.$inferInsert;

// ---------------------------------------------------------------------------
// GitHub Config (single-row preferences for PR polling)
// ---------------------------------------------------------------------------

export const githubConfig = pgTable("github_config", {
  id: uuid("id").primaryKey().defaultRandom(),
  watchedRepos: jsonb("watched_repos").$type<string[]>().notNull().default([]),
  lastPolledAt: timestamp("last_polled_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type GitHubConfig = typeof githubConfig.$inferSelect;
export type NewGitHubConfig = typeof githubConfig.$inferInsert;
