/**
 * MYMR-69 RBAC smoke matrix.
 *
 * Exercises the project role gate at the data layer using shadow users and
 * an ephemeral project — no UI, no signed-in session, no email side effects.
 *
 * Pre-req: DATABASE_URL points at the dev DB. The script picks the first
 * organization it finds (override with RBAC_TEST_ORG=<uuid>). All shadow
 * users are torn down via ON DELETE CASCADE in the finally block, even on
 * failure. The only visible artifact is two ephemeral projects that the
 * script deletes itself.
 *
 * Run: bun run scripts/smoke-rbac.ts
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  user as userTable,
  member as memberTable,
  organization,
} from "@/lib/db/auth-schema";
import { makeAuthContext } from "@/lib/auth/context";
import {
  createProject,
  deleteProject,
  renameProjectIdentifier,
  updateProject,
} from "@/lib/graph/_core/mutations";
import {
  assertProjectAccess,
  ForbiddenError,
  InsufficientRoleError,
} from "@/lib/auth/authorization";
import { asIdentifier } from "@/lib/graph/identifier";

const TS = Date.now();

let pass = 0;
const fails: string[] = [];

/**
 * Record a passing case.
 * @param label - Human-readable scenario description.
 */
function recordPass(label: string): void {
  pass++;
  console.log(`PASS  ${label}`);
}

/**
 * Record a failing case.
 * @param label - Human-readable scenario description.
 * @param why - Reason the assertion failed.
 */
function recordFail(label: string, why: string): void {
  fails.push(`${label}: ${why}`);
  console.log(`FAIL  ${label}  -> ${why}`);
}

/**
 * Run a function that must throw an instance of `klass`.
 * @param label - Human-readable scenario description.
 * @param fn - Async function expected to throw.
 * @param klass - Expected error constructor.
 */
async function expectThrows<T extends Error>(
  label: string,
  fn: () => Promise<unknown>,
  klass: new (...args: unknown[]) => T,
): Promise<void> {
  try {
    await fn();
    recordFail(label, `expected ${klass.name}, got success`);
  } catch (e) {
    if (e instanceof klass) recordPass(label);
    else
      recordFail(
        label,
        `got ${(e as Error)?.constructor?.name ?? "unknown"}: ${(e as Error)?.message}`,
      );
  }
}

/**
 * Run a function that must resolve.
 * @param label - Human-readable scenario description.
 * @param fn - Async function expected to succeed.
 */
async function expectOk(
  label: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  try {
    await fn();
    recordPass(label);
  } catch (e) {
    recordFail(
      label,
      `threw ${(e as Error)?.constructor?.name ?? "unknown"}: ${(e as Error)?.message}`,
    );
  }
}

async function main(): Promise<void> {
  const orgArg = process.env.RBAC_TEST_ORG;
  const [orgA] = orgArg
    ? await db
        .select()
        .from(organization)
        .where(eq(organization.id, orgArg))
        .limit(1)
    : await db.select().from(organization).limit(1);
  if (!orgA) {
    throw new Error(
      "No organization found. Sign up and create a team first, or set RBAC_TEST_ORG=<uuid>.",
    );
  }
  console.log(`Test org A: ${orgA.id} (${orgA.name})`);

  const allOrgs = await db.select().from(organization).limit(2);
  const orgB = allOrgs.find((o) => o.id !== orgA.id) ?? null;

  const [shadowMember] = await db
    .insert(userTable)
    .values({
      name: "RBAC Smoke (member)",
      email: `rbac-member-${TS}@invalid.local`,
      emailVerified: false,
    })
    .returning();
  const [shadowAdmin] = await db
    .insert(userTable)
    .values({
      name: "RBAC Smoke (admin)",
      email: `rbac-admin-${TS}@invalid.local`,
      emailVerified: false,
    })
    .returning();
  const [shadowOwner] = await db
    .insert(userTable)
    .values({
      name: "RBAC Smoke (owner)",
      email: `rbac-owner-${TS}@invalid.local`,
      emailVerified: false,
    })
    .returning();
  const [shadowOutsider] = await db
    .insert(userTable)
    .values({
      name: "RBAC Smoke (outsider)",
      email: `rbac-outsider-${TS}@invalid.local`,
      emailVerified: false,
    })
    .returning();

  const shadowIds = [
    shadowMember.id,
    shadowAdmin.id,
    shadowOwner.id,
    shadowOutsider.id,
  ];

  try {
    await db.insert(memberTable).values([
      {
        userId: shadowMember.id,
        organizationId: orgA.id,
        role: "member",
        createdAt: new Date(),
      },
      {
        userId: shadowAdmin.id,
        organizationId: orgA.id,
        role: "admin",
        createdAt: new Date(),
      },
      {
        userId: shadowOwner.id,
        organizationId: orgA.id,
        role: "owner",
        createdAt: new Date(),
      },
    ]);

    const memberCtxA = makeAuthContext(shadowMember.id, orgA.id);
    const adminCtxA = makeAuthContext(shadowAdmin.id, orgA.id);
    const ownerCtxA = makeAuthContext(shadowOwner.id, orgA.id);
    const outsiderCtxA = makeAuthContext(shadowOutsider.id, orgA.id);

    const seedTitle = `rbac-smoke-${TS}`;
    let project1Id: string | null = null;

    await expectOk("member can createProject", async () => {
      const p = await createProject(memberCtxA, {
        title: seedTitle,
        description: "ephemeral",
      });
      project1Id = p.id;
    });

    if (project1Id) {
      await expectOk("member can updateProject(title)", () =>
        updateProject(memberCtxA, project1Id!, { title: `${seedTitle}-edit` }),
      );

      await expectThrows(
        "member CANNOT deleteProject",
        () => deleteProject(memberCtxA, project1Id!),
        InsufficientRoleError,
      );

      await expectThrows(
        "member CANNOT renameProjectIdentifier",
        () =>
          renameProjectIdentifier(
            memberCtxA,
            project1Id!,
            asIdentifier(`MR${TS % 10000}`),
          ),
        InsufficientRoleError,
      );

      await expectOk("admin CAN renameProjectIdentifier", () =>
        renameProjectIdentifier(
          adminCtxA,
          project1Id!,
          asIdentifier(`AR${TS % 10000}`),
        ),
      );

      await expectOk("admin CAN deleteProject", () =>
        deleteProject(adminCtxA, project1Id!),
      );
    }

    let project2Id: string | null = null;
    await expectOk("owner can createProject", async () => {
      const p = await createProject(ownerCtxA, {
        title: `${seedTitle}-owner`,
        description: "ephemeral",
      });
      project2Id = p.id;
    });

    if (project2Id) {
      await expectOk("owner CAN renameProjectIdentifier", () =>
        renameProjectIdentifier(
          ownerCtxA,
          project2Id!,
          asIdentifier(`OR${TS % 10000}`),
        ),
      );
      await expectOk("owner CAN deleteProject", () =>
        deleteProject(ownerCtxA, project2Id!),
      );
    }

    let project3Id: string | null = null;
    try {
      const p = await createProject(adminCtxA, {
        title: `${seedTitle}-outsider`,
        description: "ephemeral",
      });
      project3Id = p.id;

      try {
        await assertProjectAccess(project3Id, outsiderCtxA);
        recordFail(
          "non-member: ForbiddenError, NOT InsufficientRoleError",
          "did not throw",
        );
      } catch (e) {
        if (e instanceof InsufficientRoleError)
          recordFail(
            "non-member: ForbiddenError, NOT InsufficientRoleError",
            `got InsufficientRoleError`,
          );
        else if (e instanceof ForbiddenError)
          recordPass("non-member: ForbiddenError, NOT InsufficientRoleError");
        else
          recordFail(
            "non-member: ForbiddenError, NOT InsufficientRoleError",
            `got ${(e as Error)?.constructor?.name}`,
          );
      }
    } finally {
      if (project3Id)
        await deleteProject(adminCtxA, project3Id).catch(() => {});
    }

    if (orgB) {
      console.log(`Test org B: ${orgB.id} (${orgB.name})`);
      await db.insert(memberTable).values({
        userId: shadowMember.id,
        organizationId: orgB.id,
        role: "admin",
        createdAt: new Date(),
      });

      const project4 = await createProject(adminCtxA, {
        title: `${seedTitle}-multiteam`,
        description: "ephemeral",
      });
      try {
        await expectThrows(
          "multi-team: member-of-A,admin-of-B with active=A CANNOT delete A project",
          () => deleteProject(memberCtxA, project4.id),
          InsufficientRoleError,
        );

        const memberCtxB = makeAuthContext(shadowMember.id, orgB.id);
        await expectThrows(
          "multi-team: active=B CANNOT touch A project (cross-org ForbiddenError)",
          () => deleteProject(memberCtxB, project4.id),
          ForbiddenError,
        );
      } finally {
        await deleteProject(adminCtxA, project4.id).catch(() => {});
      }
    } else {
      console.log("Skipping multi-team test: only 1 org in DB");
    }
  } finally {
    for (const id of shadowIds) {
      await db
        .delete(userTable)
        .where(eq(userTable.id, id))
        .catch(() => {});
    }
  }

  const total = pass + fails.length;
  console.log(`\n${pass}/${total} cases passed`);
  if (fails.length > 0) {
    console.log("\nFailures:");
    fails.forEach((f) => console.log(`  - ${f}`));
  }
  process.exit(fails.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
