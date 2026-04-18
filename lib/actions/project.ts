'use server';

import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { projects, tasks } from '@/lib/db/schema';
import type { ProjectStatus } from '@/lib/types';
import { parseIdentifier } from '@/lib/graph/identifier';
import {
  deleteCategory,
  renameCategory,
  updateProject,
  type ProjectUpdate,
} from '@/lib/graph/mutations';
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
  const update: ProjectUpdate = {};
  if (changes.title !== undefined) update.title = changes.title;
  if (changes.description !== undefined) update.description = changes.description;
  if (changes.categories !== undefined) update.categories = changes.categories;

  if (changes.identifier !== undefined) {
    const parsed = parseIdentifier(changes.identifier);
    if (!parsed.ok) {
      return { ok: false, code: 'invalid_identifier', message: parsed.error };
    }
    update.identifier = parsed.value;
  }

  try {
    await updateProject(projectId, update);
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
    console.error('updateProjectSettings failed', { projectId, err });
    return {
      ok: false,
      code: 'unknown',
      message: 'Something went wrong. Please try again.',
    };
  }
}

/** Result of a project category update action. Discriminated on `ok`. */
export type ProjectCategoryResult =
  | { ok: true }
  | { ok: false; code: 'unknown'; message: string };

/**
 * Rename a category on a project, propagating to associated tasks.
 * @param projectId - UUID of the project.
 * @param oldName - Existing category name.
 * @param newName - Replacement category name.
 * @returns Discriminated result — `{ ok: true }` or a typed failure.
 */
export async function renameProjectCategory(
  projectId: string,
  oldName: string,
  newName: string,
): Promise<ProjectCategoryResult> {
  try {
    await renameCategory(projectId, oldName, newName);
    return { ok: true };
  } catch (err) {
    console.error('renameProjectCategory failed', { projectId, err });
    return { ok: false, code: 'unknown', message: 'Failed to rename category' };
  }
}

/**
 * Delete a category from a project, propagating to associated tasks.
 * @param projectId - UUID of the project.
 * @param categoryName - Category to remove.
 * @returns Discriminated result — `{ ok: true }` or a typed failure.
 */
export async function deleteProjectCategory(
  projectId: string,
  categoryName: string,
): Promise<ProjectCategoryResult> {
  try {
    await deleteCategory(projectId, categoryName);
    return { ok: true };
  } catch (err) {
    console.error('deleteProjectCategory failed', { projectId, err });
    return { ok: false, code: 'unknown', message: 'Failed to remove category' };
  }
}
