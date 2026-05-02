"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/shared/Button";
import {
  regenerateTeamInviteCodeAction,
  revokeTeamInviteCodeAction,
} from "@/lib/actions/team-invite-code";
import {
  leaveTeamAction,
  removeMemberAction,
} from "@/lib/actions/team";

type CodeSnapshot = {
  code: string;
  useCount: number;
  maxUses: number | null;
  revokedAt: string | null;
};

type MemberRow = {
  memberId: string;
  userId: string;
  role: string;
  createdAt: string;
};

/**
 * Dev-only admin controls. Each button calls the corresponding server
 * action and shows the typed result inline so we can verify error codes
 * (e.g. `forbidden`, `cannot_leave_only_owner`) without diving into the
 * Network panel.
 *
 * TODO(MYMR-68 → MYMR-70): retire alongside the host page.
 *
 * @param props - Initial server-rendered snapshot and ids needed to call
 *   the admin actions.
 * @returns Card with code controls and a member list with per-row remove.
 */
export function TeamDebugForm({
  currentCode,
  members,
  activeOrgId,
  currentUserId,
  isAdmin,
}: {
  currentCode: CodeSnapshot | null;
  members: MemberRow[];
  activeOrgId: string;
  currentUserId: string;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function withStatus(label: string, fn: () => Promise<unknown>) {
    setMessage(`${label}…`);
    startTransition(async () => {
      try {
        const result = (await fn()) as
          | { ok: true; data?: unknown }
          | { ok: false; code: string; message: string };
        if (result.ok) {
          setMessage(`${label}: ok`);
          router.refresh();
        } else {
          setMessage(`${label}: ${result.code} — ${result.message}`);
        }
      } catch (err) {
        setMessage(`${label}: threw — ${(err as Error).message}`);
      }
    });
  }

  return (
    <div className="space-y-6">
      {isAdmin && (
      <section className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          Invite code
        </h2>
        {currentCode ? (
          <dl className="mb-4 space-y-1 font-mono text-xs text-text-muted">
            <div>
              <span className="text-text-secondary">code:</span>{" "}
              <span className="text-text-primary">{currentCode.code}</span>
            </div>
            <div>
              <span className="text-text-secondary">use_count:</span>{" "}
              {currentCode.useCount}
              {currentCode.maxUses !== null
                ? ` / ${currentCode.maxUses}`
                : ""}
            </div>
            {currentCode.revokedAt && (
              <div>
                <span className="text-text-secondary">revoked_at:</span>{" "}
                {currentCode.revokedAt}
              </div>
            )}
          </dl>
        ) : (
          <p className="mb-4 text-xs text-text-muted">No code yet.</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            onClick={() =>
              withStatus("regenerate", regenerateTeamInviteCodeAction)
            }
            isLoading={pending}
          >
            Regenerate
          </Button>
          <Button
            variant="secondary"
            onClick={() => withStatus("revoke", revokeTeamInviteCodeAction)}
            isLoading={pending}
          >
            Revoke
          </Button>
        </div>
      </section>
      )}

      <section className="rounded-xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <h2 className="mb-3 text-sm font-semibold text-text-primary">
          Members ({members.length})
        </h2>
        <ul className="divide-y divide-border">
          {members.map((m) => {
            const isSelf = m.userId === currentUserId;
            return (
              <li
                key={m.memberId}
                className="flex items-center justify-between gap-3 py-2 text-xs"
              >
                <div className="font-mono">
                  <div className="text-text-primary">{m.userId}</div>
                  <div className="text-text-muted">
                    {m.role} · joined {m.createdAt}
                    {isSelf ? " · you" : ""}
                  </div>
                </div>
                {!isSelf && isAdmin && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      withStatus(`remove ${m.userId.slice(0, 8)}`, () =>
                        removeMemberAction({ memberIdOrEmail: m.memberId }),
                      )
                    }
                    isLoading={pending}
                  >
                    Remove
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 border-t border-border pt-3">
          <Button
            variant="secondary"
            onClick={() =>
              withStatus("leave", () =>
                leaveTeamAction({ organizationId: activeOrgId }),
              )
            }
            isLoading={pending}
          >
            Leave this team
          </Button>
        </div>
      </section>

      {message && (
        <p
          role="status"
          className="rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-text-primary"
        >
          {message}
        </p>
      )}
    </div>
  );
}
