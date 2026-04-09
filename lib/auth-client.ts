import { createAuthClient } from "better-auth/react";
import { organizationClient } from "better-auth/client/plugins";
import { ac, owner, admin, member } from "@/lib/auth/permissions";

/**
 * Better Auth client instance.
 * Auto-discovers API at /api/auth (same origin).
 * Includes organization plugin for team management on the client.
 */
export const authClient = createAuthClient({
  plugins: [
    organizationClient({
      ac,
      roles: { owner, admin, member },
    }),
  ],
});

export const { useSession, signIn, signUp, signOut } = authClient;
