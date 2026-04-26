import "server-only";

const GITHUB_API = "https://api.github.com";

export type GitHubPR = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  state: "open" | "closed";
  merged_at: string | null;
};

function authHeaders(pat: string): HeadersInit {
  return {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "mymir-poller",
  };
}

/**
 * Fetch the 50 most-recently-updated PRs (open + closed) for a single repo.
 *
 * Uses `since` to skip PRs unchanged before the cutoff — the poller passes
 * `lastPolledAt - 10min` so quiet repos return empty quickly. Logs and
 * returns `[]` on non-200 (404, 401, rate limit, etc.) so the per-repo loop
 * keeps running on partial failures.
 */
export async function fetchRecentPRs(
  repoFullName: string,
  pat: string,
  since?: Date,
): Promise<GitHubPR[]> {
  const params = new URLSearchParams({
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: "50",
  });
  if (since) params.set("since", since.toISOString());

  const url = `${GITHUB_API}/repos/${repoFullName}/pulls?${params}`;
  const res = await fetch(url, { headers: authHeaders(pat) });
  if (!res.ok) {
    console.warn(
      `[github-poll] ${repoFullName} returned ${res.status} ${res.statusText}`,
    );
    return [];
  }
  return (await res.json()) as GitHubPR[];
}
