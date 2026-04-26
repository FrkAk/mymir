import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { githubConfig, type GitHubConfig } from "@/lib/db/schema";
import { dbEvents } from "@/lib/events";

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

function notifyChange() {
  dbEvents.emit("change", "*");
}

/**
 * Load the singleton config row, lazily creating it on first read.
 *
 * Single-tenant assumption: at most one config per Mymir instance. The row
 * is auto-created with empty `watchedRepos` so the settings UI always has
 * something to render.
 */
export async function loadConfig(): Promise<GitHubConfig> {
  const [existing] = await db.select().from(githubConfig).limit(1);
  if (existing) return existing;
  const [created] = await db
    .insert(githubConfig)
    .values({ watchedRepos: [] })
    .returning();
  return created;
}

/**
 * Add `owner/name` to the watched-repos list. Validates shape, dedupes.
 *
 * @throws if `repo` does not match `<owner>/<name>` shape.
 */
export async function addWatchedRepo(repo: string): Promise<GitHubConfig> {
  const trimmed = repo.trim();
  if (!REPO_PATTERN.test(trimmed)) {
    throw new Error(`Invalid repo: "${repo}". Expected "owner/name".`);
  }
  const config = await loadConfig();
  if (config.watchedRepos.includes(trimmed)) return config;
  const [updated] = await db
    .update(githubConfig)
    .set({
      watchedRepos: [...config.watchedRepos, trimmed],
      updatedAt: new Date(),
    })
    .where(eq(githubConfig.id, config.id))
    .returning();
  notifyChange();
  return updated;
}

export async function removeWatchedRepo(repo: string): Promise<GitHubConfig> {
  const config = await loadConfig();
  const next = config.watchedRepos.filter((r) => r !== repo);
  if (next.length === config.watchedRepos.length) return config;
  const [updated] = await db
    .update(githubConfig)
    .set({ watchedRepos: next, updatedAt: new Date() })
    .where(eq(githubConfig.id, config.id))
    .returning();
  notifyChange();
  return updated;
}

export async function clearWatchedRepos(): Promise<void> {
  const config = await loadConfig();
  await db
    .update(githubConfig)
    .set({ watchedRepos: [], updatedAt: new Date() })
    .where(eq(githubConfig.id, config.id));
  notifyChange();
}

export async function recordPolledAt(date: Date): Promise<void> {
  const config = await loadConfig();
  await db
    .update(githubConfig)
    .set({ lastPolledAt: date, updatedAt: new Date() })
    .where(eq(githubConfig.id, config.id));
}

export async function recordSyncedAt(date: Date): Promise<void> {
  const config = await loadConfig();
  await db
    .update(githubConfig)
    .set({ lastSyncedAt: date, updatedAt: new Date() })
    .where(eq(githubConfig.id, config.id));
}

/** PAT is sourced from the `GITHUB_TOKEN` env var. Returns null when unset. */
export function getPATFromEnv(): string | null {
  const pat = process.env.GITHUB_TOKEN?.trim();
  return pat ? pat : null;
}

/** Mask all but the last 4 characters of a PAT for safe display. */
export function maskPAT(pat: string): string {
  if (pat.length <= 4) return "…" + pat;
  return `${pat.slice(0, 4)}…${pat.slice(-4)}`;
}
