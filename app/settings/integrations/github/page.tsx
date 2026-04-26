import Link from "next/link";
import { redirect } from "next/navigation";
import { TopBar } from "@/components/layout/TopBar";
import { PageShell } from "@/components/layout/PageShell";
import { getSession } from "@/lib/auth/session";
import { getPATFromEnv, loadConfig, maskPAT } from "@/lib/github/config";
import { IntegrationForm } from "./integration-form";

export const dynamic = "force-dynamic";

/**
 * Server-side settings page for the PR-polling integration.
 *
 * Reads the PAT only on the server — never sends the value to the client.
 * The client form receives `{ configured, lastFour }` plus the watched-repo
 * list and the timing state.
 */
export default async function GitHubIntegrationPage() {
  const session = await getSession();
  if (!session) redirect("/auth/sign-in");

  const config = await loadConfig();
  const pat = getPATFromEnv();
  const patStatus = pat
    ? { configured: true as const, masked: maskPAT(pat) }
    : { configured: false as const };

  return (
    <>
      <TopBar />
      <PageShell className="max-w-2xl">
        <Link
          href="/settings"
          className="mb-4 inline-flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary"
        >
          &larr; Back to settings
        </Link>
        <h1 className="text-2xl font-semibold text-text-primary mb-1">
          GitHub Integration
        </h1>
        <p className="text-sm text-text-muted mb-8">
          Poll watched repositories every 5 minutes for pull-request activity.
          Pull-requests with bracketed Mymir refs ({" "}
          <code className="font-mono text-xs">[MYMR-123]</code>) drive task
          status; plain refs link without changing status.
        </p>

        <IntegrationForm
          patStatus={patStatus}
          watchedRepos={config.watchedRepos}
          lastPolledAt={config.lastPolledAt?.toISOString() ?? null}
        />
      </PageShell>
    </>
  );
}
