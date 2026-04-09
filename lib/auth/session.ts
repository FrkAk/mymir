import { headers } from "next/headers";
import { auth } from "@/lib/auth";

/**
 * Get the current session from request headers.
 * @returns Session object or null if not authenticated.
 */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Get the current session, throwing if not authenticated.
 * Use in server components and API routes that require auth.
 * @returns Validated session object.
 * @throws Error if no active session.
 */
export async function requireSession() {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized");
  return session;
}
