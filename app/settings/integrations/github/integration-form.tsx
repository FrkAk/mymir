"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/shared/Button";
import {
  addRepoAction,
  removeRepoAction,
  disconnectAction,
  triggerSyncAction,
  type SyncOutcome,
} from "./actions";

const REPO_PATTERN = /^[\w.-]+\/[\w.-]+$/;

type PATStatus =
  | { configured: true; masked: string }
  | { configured: false };

type Props = {
  patStatus: PATStatus;
  watchedRepos: string[];
  lastPolledAt: string | null;
};

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "just now";
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}

export function IntegrationForm({
  patStatus,
  watchedRepos,
  lastPolledAt,
}: Props) {
  const [pending, startTransition] = useTransition();
  const [repoInput, setRepoInput] = useState("");
  const [repoError, setRepoError] = useState<string | null>(null);
  const [syncOutcome, setSyncOutcome] = useState<SyncOutcome | null>(null);

  const handleAdd = (formData: FormData) => {
    const value = String(formData.get("repo") ?? "").trim();
    if (!REPO_PATTERN.test(value)) {
      setRepoError(`"${value}" — expected format: owner/name`);
      return;
    }
    setRepoError(null);
    startTransition(async () => {
      try {
        await addRepoAction(formData);
        setRepoInput("");
      } catch (err) {
        setRepoError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const handleRemove = (repo: string) => {
    startTransition(() => removeRepoAction(repo));
  };

  const handleDisconnect = () => {
    if (
      !confirm(
        "Remove all watched repos? Existing task_links rows are kept; future polls will do nothing until you add repos again.",
      )
    ) {
      return;
    }
    startTransition(() => disconnectAction());
  };

  const handleSync = () => {
    setSyncOutcome(null);
    startTransition(async () => {
      const outcome = await triggerSyncAction();
      setSyncOutcome(outcome);
    });
  };

  return (
    <div className="space-y-8">
      {/* PAT status */}
      <section>
        <h2 className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Personal Access Token
        </h2>
        {patStatus.configured ? (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-done" />
            <code className="font-mono text-sm text-text-primary">
              {patStatus.masked}
            </code>
            <span className="text-xs text-text-muted">
              from <code>GITHUB_TOKEN</code> env var
            </span>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-progress" />
            <span className="text-sm text-text-primary">
              <code>GITHUB_TOKEN</code> not set
            </span>
          </div>
        )}
        <p className="mt-1 text-xs text-text-muted">
          {patStatus.configured
            ? "To rotate the token, edit .env.local and restart the server."
            : "Add GITHUB_TOKEN to .env.local and restart to enable polling."}
        </p>
      </section>

      <div className="h-px bg-border" />

      {/* Watched repos */}
      <section>
        <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Watched Repositories
        </h2>
        {watchedRepos.length === 0 ? (
          <p className="mb-3 text-sm text-text-muted">
            No repos watched yet. Add an <code>owner/name</code> below to start
            polling.
          </p>
        ) : (
          <ul className="mb-3 space-y-1.5">
            {watchedRepos.map((repo) => (
              <li
                key={repo}
                className="flex items-center justify-between rounded-md border border-border-strong bg-surface px-3 py-1.5"
              >
                <code className="font-mono text-sm text-text-primary">
                  {repo}
                </code>
                <button
                  type="button"
                  onClick={() => handleRemove(repo)}
                  disabled={pending}
                  className="text-xs text-text-muted transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          action={handleAdd}
          className="flex gap-2"
        >
          <input
            type="text"
            name="repo"
            value={repoInput}
            onChange={(e) => {
              setRepoInput(e.target.value);
              setRepoError(null);
            }}
            placeholder="owner/name"
            disabled={pending}
            className="flex-1 rounded-lg border border-border-strong bg-surface px-3 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted outline-none focus:border-accent disabled:opacity-50"
          />
          <Button variant="secondary" size="sm" type="submit">
            {pending ? "Adding..." : "Add"}
          </Button>
        </form>
        {repoError && (
          <p className="mt-1 text-xs text-danger">{repoError}</p>
        )}
      </section>

      <div className="h-px bg-border" />

      {/* Sync controls */}
      <section>
        <h2 className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Sync
        </h2>
        <div className="flex items-center gap-3">
          <Button
            variant="primary"
            size="sm"
            onClick={handleSync}
            disabled={pending || !patStatus.configured}
          >
            {pending ? "Syncing..." : "Sync now"}
          </Button>
          <span className="text-xs text-text-muted">
            Last polled: {formatRelative(lastPolledAt)}
          </span>
        </div>
        {syncOutcome && (
          <p
            className={`mt-2 font-mono text-xs ${
              syncOutcome.ok ? "text-done" : "text-danger"
            }`}
          >
            {syncOutcome.ok
              ? syncOutcome.result.patMissing
                ? "GITHUB_TOKEN missing — sync skipped."
                : `Synced ${syncOutcome.result.prsProcessed} PR${
                    syncOutcome.result.prsProcessed === 1 ? "" : "s"
                  } across ${syncOutcome.result.reposPolled} repo${
                    syncOutcome.result.reposPolled === 1 ? "" : "s"
                  }${
                    syncOutcome.result.errors.length
                      ? `; ${syncOutcome.result.errors.length} error(s)`
                      : ""
                  }.`
              : syncOutcome.message}
          </p>
        )}
      </section>

      {watchedRepos.length > 0 && (
        <>
          <div className="h-px bg-border" />
          <section>
            <button
              type="button"
              onClick={handleDisconnect}
              disabled={pending}
              className="text-xs text-text-muted transition-colors hover:text-danger disabled:cursor-not-allowed disabled:opacity-50"
            >
              Disconnect (clear watched repos)
            </button>
          </section>
        </>
      )}
    </div>
  );
}
