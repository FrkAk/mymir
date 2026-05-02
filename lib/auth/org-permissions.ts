import "server-only";

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { member } from "@/lib/db/auth-schema";
import type { AuthContext } from "@/lib/auth/context";

/**
 * Roles allowed to mutate team-level state (rotate invite codes, remove
 * members, change roles). Better Auth stores roles as a comma-separated
 * string per member row, so we split and trim before checking.
 */
const ADMIN_ROLES = new Set(["owner", "admin"]);

/**
 * Check whether the caller holds an admin-equivalent role in their active
 * organization. Reads `neon_auth.member.role` for the (userId, activeOrgId)
 * pair. Treated as a single source of truth until MYMR-69 wires Better
 * Auth's `hasPermission` checks into the data layer.
 *
 * @param ctx - Resolved auth context (verified user + active org).
 * @returns True when the caller's role intersects {`owner`, `admin`}.
 */
export async function isOrgAdmin(ctx: AuthContext): Promise<boolean> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(
      and(
        eq(member.userId, ctx.userId),
        eq(member.organizationId, ctx.activeOrgId),
      ),
    )
    .limit(1);
  if (!row) return false;
  return row.role.split(",").some((r) => ADMIN_ROLES.has(r.trim()));
}
