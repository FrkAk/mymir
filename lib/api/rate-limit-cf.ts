import type { RateLimitBackend, RateLimitResult } from "./rate-limit";

/**
 * Cloudflare Workers Rate Limit Binding type.
 * Matches the binding API shape from wrangler.toml [[rate_limiting]].
 */
export type CloudflareRateLimitBinding = {
  limit: (opts: { key: string }) => Promise<{ success: boolean }>;
};

/**
 * Cloudflare Workers rate limit backend.
 * Uses the CF Rate Limit Binding (GA Sept 2025) for distributed,
 * near-zero-latency rate limiting across edge locations.
 *
 * Stub implementation — will be tested when CF Workers deployment is set up.
 */
export class CloudflareRateLimitBackend implements RateLimitBackend {
  constructor(private binding: CloudflareRateLimitBinding) {}

  /**
   * Check and consume one request against the rate limit via CF binding.
   * @param key - Unique key identifying the client.
   * @param max - Maximum requests allowed in the window.
   * @param windowSeconds - Window duration in seconds.
   * @returns Result with allowed status and approximate quota info.
   */
  async check(
    key: string,
    max: number,
    windowSeconds: number,
  ): Promise<RateLimitResult> {
    const compositeKey = `${key}:${max}:${windowSeconds}`;
    const result = await this.binding.limit({ key: compositeKey });

    return {
      allowed: result.success,
      limit: max,
      remaining: result.success ? max - 1 : 0,
      resetIn: windowSeconds,
    };
  }
}
