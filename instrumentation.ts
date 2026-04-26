/**
 * Next.js instrumentation hook — called once per server process start.
 *
 * Schedules the GitHub PR poller: one immediate run on startup, then every
 * 5 minutes via `setInterval`. The poll is fire-and-forget — failures are
 * logged but never block startup or other request handling. Skipped on
 * non-Node runtimes (edge / preview build).
 */
const POLL_INTERVAL_MS = 5 * 60 * 1000;

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { pollAllRepos } = await import("@/lib/github/poll");
  const run = () =>
    pollAllRepos().catch((err) =>
      console.error("[github-poll]", err),
    );
  run();
  setInterval(run, POLL_INTERVAL_MS);
}
