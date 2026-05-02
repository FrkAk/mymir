import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, organization } from "@/lib/db/auth-schema";
import { requireSession } from "@/lib/auth/session";
import { getAuthContext, NoActiveTeamError } from "@/lib/auth/context";
import { isOrgAdmin } from "@/lib/auth/org-permissions";
import { teamInviteCodes } from "@/lib/db/team-schema";
import { TeamDebugForm } from "./TeamDebugForm";

export const dynamic = "force-dynamic";

/**
 * Dev-only admin debug page for MYMR-68 smoke testing. Lists the active
 * team's invite code and members, with buttons to invoke the admin actions
 * (`regenerate`, `revoke`, `remove member`, `leave team`).
 *
 * TODO(MYMR-68 → MYMR-70): delete this whole `/dev/team-debug` route once
 * the team-settings UI surfaces the same actions for end users.
 *
 * @returns Server-rendered debug panel.
 */
export default async function TeamDebugPage() {
  await requireSession();

  let ctx;
  try {
    ctx = await getAuthContext();
  } catch (err) {
    if (err instanceof NoActiveTeamError) redirect("/onboarding/team");
    throw err;
  }

  const isAdmin = await isOrgAdmin(ctx);

  const [orgRow] = await db
    .select({ name: organization.name, slug: organization.slug })
    .from(organization)
    .where(eq(organization.id, ctx.activeOrgId))
    .limit(1);

  const [code] = await db
    .select()
    .from(teamInviteCodes)
    .where(eq(teamInviteCodes.organizationId, ctx.activeOrgId))
    .limit(1);

  const members = await db
    .select({
      memberId: member.id,
      userId: member.userId,
      role: member.role,
      createdAt: member.createdAt,
    })
    .from(member)
    .where(eq(member.organizationId, ctx.activeOrgId))
    .orderBy(member.createdAt);

  return (
    <main className="mx-auto mt-12 max-w-2xl space-y-6 px-4 pb-20">
      <header>
        <h1 className="text-2xl font-semibold text-text-primary">
          Team debug — {orgRow?.name ?? ctx.activeOrgId}
        </h1>
        <p className="mt-1 text-sm text-text-muted">
          Dev-only panel for MYMR-68 smoke testing. Removed when MYMR-70 ships
          the real settings UI.
        </p>
      </header>

      <TeamDebugForm
        currentCode={
          code
            ? {
                code: code.code,
                useCount: code.useCount,
                maxUses: code.maxUses,
                revokedAt: code.revokedAt
                  ? code.revokedAt.toISOString()
                  : null,
              }
            : null
        }
        members={members.map((m) => ({
          memberId: m.memberId,
          userId: m.userId,
          role: m.role,
          createdAt: m.createdAt.toISOString(),
        }))}
        activeOrgId={ctx.activeOrgId}
        currentUserId={ctx.userId}
        isAdmin={isAdmin}
      />
    </main>
  );
}
