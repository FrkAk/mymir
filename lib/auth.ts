import { betterAuth } from "better-auth";
import { organization } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { ac, owner, admin, member } from "@/lib/auth/permissions";

/**
 * Separate postgres connection scoped to the neon_auth schema.
 * Keeps auth tables isolated from the app's public schema.
 */
const authSql = postgres(process.env.DATABASE_URL!, {
  connection: { search_path: "neon_auth" },
});
const authDb = drizzle(authSql);

/**
 * Better Auth server instance.
 * Uses Neon Auth's existing schema (neon_auth) via drizzleAdapter.
 * Provides email/password auth and organization-based team management.
 */
export const auth = betterAuth({
  database: drizzleAdapter(authDb, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  plugins: [
    organization({
      ac,
      roles: { owner, admin, member },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
