'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, tasks } from '@/lib/db/schema';
import type { ProjectStatus } from '@/lib/types';
import { validateIdentifier } from '@/lib/graph/identifier';
import { updateProject } from '@/lib/graph/mutations';
import { dbEvents } from '@/lib/events';

/**
 * Update a project's status.
 * @param projectId - UUID of the project.
 * @param status - New project status.
 * @returns The updated project row.
 */
export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  const [updated] = await db
    .update(projects)
    .set({ status, updatedAt: new Date() })
    .where(eq(projects.id, projectId))
    .returning();
  dbEvents.emit('change', '*');
  return updated;
}

/**
 * Get a project's status and task count for phase validation.
 * @param projectId - UUID of the project.
 * @returns Project status and task count, or null if not found.
 */
export async function getProjectPhaseInfo(projectId: string) {
  const [project] = await db
    .select({ id: projects.id, status: projects.status })
    .from(projects)
    .where(eq(projects.id, projectId));
  if (!project) return null;

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));

  return { status: project.status as ProjectStatus, taskCount: countRow?.count ?? 0 };
}

/** Result of a project settings update action. Discriminated on `ok`. */
export type ProjectSettingsResult =
  | { ok: true }
  | { ok: false; code: 'invalid_identifier' | 'identifier_conflict' | 'unknown'; message: string };

/** Fields the settings modal can update. All optional. */
export interface ProjectSettingsChanges {
  title?: string;
  description?: string;
  identifier?: string;
  categories?: string[];
}

/**
 * Update project settings with identifier validation and conflict mapping.
 *
 * Validates `identifier` client-side shape rules before the write and maps
 * PostgreSQL unique-violations (code `23505`) to a typed `identifier_conflict`
 * result so the UI can surface a non-fatal inline error without losing input.
 *
 * @param projectId - UUID of the project to update.
 * @param changes - Partial fields to persist.
 * @returns Discriminated result — `{ ok: true }` or a typed failure.
 */
export async function updateProjectSettings(
  projectId: string,
  changes: ProjectSettingsChanges,
): Promise<ProjectSettingsResult> {
  if (changes.identifier !== undefined) {
    const validationError = validateIdentifier(changes.identifier);
    if (validationError) {
      return { ok: false, code: 'invalid_identifier', message: validationError };
    }
  }

  try {
    await updateProject(projectId, changes as Record<string, unknown>);
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === '23505') {
      return {
        ok: false,
        code: 'identifier_conflict',
        message: 'That identifier is already in use by another project',
      };
    }
    return {
      ok: false,
      code: 'unknown',
      message: err instanceof Error ? err.message : 'Failed to update project',
    };
  }
}
