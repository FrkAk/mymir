import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { taskLinks } from "@/lib/db/schema";
import { fetchRecentPRs, type GitHubPR } from "./pat-client";
import {
  loadConfig,
  recordPolledAt,
  getPATFromEnv,
} from "./config";
import {
  processPR,
  type NormalizedPR,
  type ProcessAction,
} from "./process-pr";

export type PollResult = {
  reposPolled: number;
  prsProcessed: number;
  errors: { repo: string; message: string }[];
  patMissing?: boolean;
};

const SAFETY_OVERLAP_MS = 10 * 60 * 1000;

function normalize(pr: GitHubPR, repoFullName: string): NormalizedPR {
  const merged = pr.merged_at !== null;
  const state: NormalizedPR["state"] =
    pr.state === "open" ? "open" : merged ? "merged" : "closed";
  return {
    prId: pr.id,
    number: pr.number,
    title: pr.title,
    body: pr.body ?? "",
    url: pr.html_url,
    merged,
    state,
    repoFullName,
  };
}

/**
 * Pick the `processPR` action label that best matches a polled PR.
 *
 * Polling sees end states, not transitions, so we infer:
 * - first-time sighting of an open PR → "opened"
 * - existing link, PR still open, title/url/etc. updated → "edited"
 * - existing closed link, now open again → "reopened"
 * - currently closed (merged or not) → "closed"
 *
 * The `action` is informational on `processPR`'s side anyway (state-machine
 * decisions are driven by `pr.state`), but pass a reasonable label for any
 * future use.
 */
function deriveAction(
  pr: NormalizedPR,
  prevState: string | null,
): ProcessAction {
  if (pr.state !== "open") return "closed";
  if (prevState === null) return "opened";
  if (prevState !== "open") return "reopened";
  return "edited";
}

/**
 * Poll GitHub for PR activity in every watched repo.
 *
 * 1. Read the PAT from env. Skip silently if unset (return `patMissing: true`).
 * 2. Load watched-repo list from `github_config`. Empty list → nothing to do.
 * 3. Compute `since = lastPolledAt - 10min` (overlap absorbs minor clock skew
 *    and the lag between PR update and our next call).
 * 4. For each repo, fetch recent PRs and dispatch any with state/title drift
 *    to `processPR`. Per-repo errors are collected, never throw.
 * 5. Stamp `lastPolledAt` so the next cycle narrows its `since` window.
 *
 * Reuses MYMR-85's `processPR` end-to-end for link upserts and task status
 * transitions.
 */
export async function pollAllRepos(): Promise<PollResult> {
  const pat = getPATFromEnv();
  if (!pat) {
    return { reposPolled: 0, prsProcessed: 0, errors: [], patMissing: true };
  }

  const config = await loadConfig();
  if (config.watchedRepos.length === 0) {
    return { reposPolled: 0, prsProcessed: 0, errors: [] };
  }

  const since = config.lastPolledAt
    ? new Date(config.lastPolledAt.getTime() - SAFETY_OVERLAP_MS)
    : undefined;

  const errors: PollResult["errors"] = [];
  let prsProcessed = 0;
  let reposPolled = 0;

  for (const repo of config.watchedRepos) {
    try {
      const prs = await fetchRecentPRs(repo, pat, since);
      reposPolled++;
      for (const pr of prs) {
        const normalized = normalize(pr, repo);
        const [existing] = await db
          .select({ state: taskLinks.state, title: taskLinks.title })
          .from(taskLinks)
          .where(eq(taskLinks.prId, normalized.prId));
        if (
          existing &&
          existing.state === normalized.state &&
          existing.title === normalized.title
        ) {
          continue;
        }
        const action = deriveAction(normalized, existing?.state ?? null);
        const result = await processPR(normalized, action);
        if (result.error) {
          errors.push({ repo, message: result.error });
        } else {
          prsProcessed += result.linksProcessed;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ repo, message });
    }
  }

  await recordPolledAt(new Date());

  return { reposPolled, prsProcessed, errors };
}
