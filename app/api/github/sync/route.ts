import { ok, error } from "@/lib/api/response";
import { requireSession } from "@/lib/auth/session";
import { pollAllRepos } from "@/lib/github/poll";
import {
  getPATFromEnv,
  loadConfig,
  recordSyncedAt,
} from "@/lib/github/config";

const SYNC_RATE_LIMIT_MS = 30_000;

/**
 * Manually trigger a poll cycle.
 *
 * Returns 401 if no session, 503 if `GITHUB_TOKEN` env var is unset, 429 if
 * the user pressed Sync now within 30s of the last manual trigger. Otherwise
 * runs `pollAllRepos()` synchronously and returns the result counts.
 */
export async function POST() {
  try {
    await requireSession();
  } catch {
    return error("Unauthorized", 401);
  }

  if (!getPATFromEnv()) {
    return error(
      "GITHUB_TOKEN env var not set. Add it to .env.local and restart.",
      503,
    );
  }

  const config = await loadConfig();
  if (
    config.lastSyncedAt &&
    Date.now() - config.lastSyncedAt.getTime() < SYNC_RATE_LIMIT_MS
  ) {
    return error("Synced too recently. Wait 30 seconds and try again.", 429);
  }

  await recordSyncedAt(new Date());
  const result = await pollAllRepos();
  return ok(result);
}
