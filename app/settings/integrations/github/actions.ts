"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth/session";
import {
  addWatchedRepo,
  removeWatchedRepo,
  clearWatchedRepos,
  getPATFromEnv,
  loadConfig,
  recordSyncedAt,
} from "@/lib/github/config";
import { pollAllRepos, type PollResult } from "@/lib/github/poll";

const SYNC_RATE_LIMIT_MS = 30_000;
const SETTINGS_PATH = "/settings/integrations/github";

export async function addRepoAction(formData: FormData): Promise<void> {
  await requireSession();
  const repo = String(formData.get("repo") ?? "").trim();
  if (!repo) return;
  await addWatchedRepo(repo);
  revalidatePath(SETTINGS_PATH);
}

export async function removeRepoAction(repo: string): Promise<void> {
  await requireSession();
  await removeWatchedRepo(repo);
  revalidatePath(SETTINGS_PATH);
}

export async function disconnectAction(): Promise<void> {
  await requireSession();
  await clearWatchedRepos();
  revalidatePath(SETTINGS_PATH);
}

export type SyncOutcome =
  | { ok: true; result: PollResult }
  | { ok: false; status: number; message: string };

export async function triggerSyncAction(): Promise<SyncOutcome> {
  await requireSession();

  if (!getPATFromEnv()) {
    return {
      ok: false,
      status: 503,
      message:
        "GITHUB_TOKEN env var not set. Add it to .env.local and restart.",
    };
  }

  const config = await loadConfig();
  if (
    config.lastSyncedAt &&
    Date.now() - config.lastSyncedAt.getTime() < SYNC_RATE_LIMIT_MS
  ) {
    return {
      ok: false,
      status: 429,
      message: "Synced too recently. Wait 30 seconds and try again.",
    };
  }

  await recordSyncedAt(new Date());
  const result = await pollAllRepos();
  revalidatePath(SETTINGS_PATH);
  return { ok: true, result };
}
