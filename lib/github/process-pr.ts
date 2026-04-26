import "server-only";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { projects, tasks, taskLinks } from "@/lib/db/schema";
import type { HistoryEntry, TaskStatus } from "@/lib/types";
import { dbEvents } from "@/lib/events";
import { parseRefs, type ParsedRef } from "./parse-refs";

export type NormalizedPR = {
  prId: number;
  number: number;
  title: string;
  body: string;
  url: string;
  merged: boolean;
  state: "open" | "merged" | "closed";
  repoFullName: string;
};

export type ProcessAction = "opened" | "edited" | "closed" | "reopened";

export type ProcessResult = {
  linksProcessed: number;
  error?: string;
};

type ResolvedRef = ParsedRef & { taskId: string; status: TaskStatus };

function makeHistoryEntry(
  entry: Omit<HistoryEntry, "id" | "date">,
): HistoryEntry {
  return {
    ...entry,
    id: crypto.randomUUID(),
    date: new Date().toISOString(),
  };
}

/**
 * Resolve parsed refs to task UUIDs by looking up identifier + sequence.
 * Silently drops refs whose project identifier or sequence does not exist.
 */
async function resolveRefs(refs: ParsedRef[]): Promise<ResolvedRef[]> {
  if (refs.length === 0) return [];

  const identifiers = [...new Set(refs.map((r) => r.identifier))];
  const projectRows = await db
    .select({ id: projects.id, identifier: projects.identifier })
    .from(projects)
    .where(inArray(projects.identifier, identifiers));

  const projectByIdentifier = new Map(
    projectRows.map((p) => [p.identifier, p.id]),
  );

  const resolved: ResolvedRef[] = [];
  for (const ref of refs) {
    const projectId = projectByIdentifier.get(ref.identifier);
    if (!projectId) continue;
    const [task] = await db
      .select({ id: tasks.id, status: tasks.status })
      .from(tasks)
      .where(
        and(
          eq(tasks.projectId, projectId),
          eq(tasks.sequenceNumber, ref.sequence),
        ),
      );
    if (!task) continue;
    resolved.push({ ...ref, taskId: task.id, status: task.status });
  }
  return resolved;
}

async function transitionTaskStatus(
  taskId: string,
  newStatus: TaskStatus,
  prTitle: string,
  prNumber: number,
): Promise<void> {
  const [current] = await db
    .select({ history: tasks.history, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!current) return;
  if (current.status === newStatus) return;

  const entry = makeHistoryEntry({
    type: "status_change",
    label: `Status: ${current.status} → ${newStatus}`,
    description: `Status changed by GitHub PR #${prNumber} ("${prTitle}").`,
    actor: "system",
  });

  const existing = (current.history ?? []) as HistoryEntry[];
  await db
    .update(tasks)
    .set({
      status: newStatus,
      history: [...existing, entry],
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

async function revertTaskStatus(
  taskId: string,
  previousStatus: TaskStatus,
  prTitle: string,
  prNumber: number,
): Promise<void> {
  const [current] = await db
    .select({ history: tasks.history, status: tasks.status })
    .from(tasks)
    .where(eq(tasks.id, taskId));
  if (!current) return;
  if (current.status === "done") return;
  if (current.status === previousStatus) return;

  const entry = makeHistoryEntry({
    type: "status_change",
    label: `Status: ${current.status} → ${previousStatus}`,
    description: `Status reverted after GitHub PR #${prNumber} ("${prTitle}") closed without merge.`,
    actor: "system",
  });

  const existing = (current.history ?? []) as HistoryEntry[];
  await db
    .update(tasks)
    .set({
      status: previousStatus,
      history: [...existing, entry],
      updatedAt: new Date(),
    })
    .where(eq(tasks.id, taskId));
}

/**
 * Insert or update a single link row for `(prId, taskId)`.
 *
 * Idempotency: `previousTaskStatus` is captured ONLY on first insert. Later
 * upserts (PR title edit, state change) refresh `state`/`title`/`url` and
 * leave the original `previousTaskStatus` intact so revert targets stay
 * stable.
 *
 * @returns Whether this call inserted a new row (vs. updated an existing one).
 */
async function upsertLink(
  pr: NormalizedPR,
  ref: ResolvedRef,
): Promise<{ inserted: boolean }> {
  const [existing] = await db
    .select({ id: taskLinks.id })
    .from(taskLinks)
    .where(
      and(eq(taskLinks.prId, pr.prId), eq(taskLinks.taskId, ref.taskId)),
    );

  if (existing) {
    await db
      .update(taskLinks)
      .set({
        url: pr.url,
        title: pr.title,
        number: pr.number,
        state: pr.state,
        isPrimary: ref.isPrimary,
        repoFullName: pr.repoFullName,
        updatedAt: new Date(),
      })
      .where(eq(taskLinks.id, existing.id));
    return { inserted: false };
  }

  await db.insert(taskLinks).values({
    taskId: ref.taskId,
    url: pr.url,
    title: pr.title,
    number: pr.number,
    state: pr.state,
    isPrimary: ref.isPrimary,
    prId: pr.prId,
    repoFullName: pr.repoFullName,
    previousTaskStatus: ref.isPrimary ? ref.status : null,
  });
  return { inserted: true };
}

/**
 * Process a normalized PR event end to end.
 *
 * Steps:
 * 1. Parse refs from `title + body`. Reject if more than one bracketed primary.
 * 2. Resolve refs to task UUIDs (silently drop unresolvable).
 * 3. Diff parsed refs against existing links for this PR — add new, remove dropped, update existing.
 * 4. For the primary ref, drive task status:
 *    - opened/reopened → in_progress (only on first link insert; idempotent on re-deliveries)
 *    - merged → done
 *    - closed-unmerged → revert to previousTaskStatus stored on the link
 * 5. Emit a single `dbEvents.emit("change", "*")` so SSE-connected UI refreshes.
 */
export async function processPR(
  pr: NormalizedPR,
  action: ProcessAction,
): Promise<ProcessResult> {
  const { refs, error } = parseRefs(`${pr.title}\n${pr.body ?? ""}`);
  if (error) return { linksProcessed: 0, error };

  const resolved = await resolveRefs(refs);
  const resolvedKeyByTaskId = new Map(resolved.map((r) => [r.taskId, r]));

  const existingLinks = await db
    .select()
    .from(taskLinks)
    .where(eq(taskLinks.prId, pr.prId));

  const existingByTaskId = new Map(existingLinks.map((l) => [l.taskId, l]));

  // Drop links whose ref disappeared from the PR (only relevant for `edited`).
  const droppedLinks = existingLinks.filter(
    (l) => !resolvedKeyByTaskId.has(l.taskId),
  );
  for (const link of droppedLinks) {
    if (link.isPrimary && link.previousTaskStatus && pr.state !== "merged") {
      await revertTaskStatus(
        link.taskId,
        link.previousTaskStatus,
        pr.title,
        pr.number,
      );
    }
    await db.delete(taskLinks).where(eq(taskLinks.id, link.id));
  }

  let linksProcessed = 0;

  for (const ref of resolved) {
    const wasExisting = existingByTaskId.has(ref.taskId);
    const { inserted } = await upsertLink(pr, ref);
    linksProcessed++;

    if (!ref.isPrimary) continue;

    // Primary ref state-machine
    if (pr.state === "merged") {
      await transitionTaskStatus(ref.taskId, "done", pr.title, pr.number);
    } else if (pr.state === "closed") {
      // closed without merge — revert to previousTaskStatus stored on existing link if any
      const link = existingByTaskId.get(ref.taskId);
      const previous = link?.previousTaskStatus ?? ref.status;
      await revertTaskStatus(ref.taskId, previous, pr.title, pr.number);
    } else if (pr.state === "open") {
      // opened/reopened/edited — only transition on FIRST insert to stay idempotent
      if (inserted && !wasExisting) {
        await transitionTaskStatus(
          ref.taskId,
          "in_progress",
          pr.title,
          pr.number,
        );
      }
    }
  }

  if (linksProcessed > 0 || droppedLinks.length > 0) {
    dbEvents.emit("change", "*");
  }

  // `action` is currently informational — handler logic is driven entirely by
  // `pr.state`, which already encodes opened/closed/merged. Surfacing it on
  // history entries would add noise without changing behavior.
  void action;

  return { linksProcessed };
}
