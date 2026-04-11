/**
 * Per-user concurrent SSE connection limiter.
 * In-memory — works for single-process self-hosted deployments.
 * CF Workers have a 30s CPU time limit, making long-lived SSE impractical there.
 */

const MAX_CONCURRENT_SSE = 5;
const connections = new Map<string, number>();

/**
 * Try to acquire an SSE connection slot for a user.
 * @param userId - The authenticated user's ID.
 * @returns true if the connection is allowed, false if at the limit.
 */
export function acquireSSESlot(userId: string): boolean {
  const current = connections.get(userId) ?? 0;
  if (current >= MAX_CONCURRENT_SSE) return false;
  connections.set(userId, current + 1);
  return true;
}

/**
 * Release an SSE connection slot when the client disconnects.
 * @param userId - The authenticated user's ID.
 */
export function releaseSSESlot(userId: string): void {
  const current = connections.get(userId) ?? 0;
  if (current <= 1) connections.delete(userId);
  else connections.set(userId, current - 1);
}
