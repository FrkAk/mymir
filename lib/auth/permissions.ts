import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  project: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

/**
 * Owner role — team creator. Full permissions on projects and members.
 */
export const owner = ac.newRole({
  project: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
});

/**
 * Admin role — promoted by owner. Same permissions as owner.
 */
export const admin = ac.newRole({
  project: ["create", "read", "update", "delete"],
  member: ["create", "read", "update", "delete"],
});

/**
 * Member role — default for new team members.
 * Can create/read/update projects but not delete.
 * Can only read member list.
 */
export const member = ac.newRole({
  project: ["create", "read", "update"],
  member: ["read"],
});
