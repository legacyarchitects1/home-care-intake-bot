import type { Env } from "./types";

const WINDOW_SECONDS = 600; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 5;

/**
 * Fixed-window rate limiter backed by the same KV namespace as the
 * compliance log (no extra namespace/deploy step needed). Keyed by
 * CF-Connecting-IP, which Cloudflare's edge sets and overwrites on every
 * request — not something a client can spoof.
 *
 * This is intentionally simple (fixed window, not sliding, not perfectly
 * race-free under concurrent hits in the same millisecond) rather than
 * building on Durable Objects. For a public intake form that's a fine
 * trade-off: the goal is stopping cost-draining scripted abuse, not
 * millisecond-precise quota enforcement.
 */
export async function checkRateLimit(
  env: Env,
  request: Request,
): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const windowStart = Math.floor(Date.now() / 1000 / WINDOW_SECONDS) * WINDOW_SECONDS;
  const key = `ratelimit:${ip}:${windowStart}`;

  const current = await env.SUBMISSIONS_LOG.get(key);
  const count = current ? parseInt(current, 10) : 0;

  if (count >= MAX_REQUESTS_PER_WINDOW) {
    const retryAfterSeconds = windowStart + WINDOW_SECONDS - Math.floor(Date.now() / 1000);
    return { allowed: false, retryAfterSeconds: Math.max(retryAfterSeconds, 1) };
  }

  // expirationTtl must be >= 60s in Cloudflare KV; the window is 600s so
  // this always leaves enough time for the count to be visible for the
  // rest of the current window before expiring on its own.
  await env.SUBMISSIONS_LOG.put(key, String(count + 1), { expirationTtl: WINDOW_SECONDS });
  return { allowed: true };
}
