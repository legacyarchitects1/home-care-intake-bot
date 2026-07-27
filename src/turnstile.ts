/**
 * Cloudflare Turnstile bot-check. Entirely optional: only enforced when
 * TURNSTILE_SECRET_KEY is set in the environment, so existing deploys
 * (and local dev) keep working without it. To enable:
 *   1. Create a Turnstile widget at https://dash.cloudflare.com/?to=/:account/turnstile
 *   2. wrangler secret put TURNSTILE_SECRET_KEY   (the secret key)
 *   3. Pass the site key to the widget via the script tag's
 *      data-turnstile-sitekey attribute (see README) — widget.js renders
 *      the challenge and includes the resulting token automatically.
 */
export async function verifyTurnstileToken(
  token: string | undefined,
  secretKey: string,
  remoteIp: string,
): Promise<boolean> {
  if (!token) return false;

  const body = new FormData();
  body.append("secret", secretKey);
  body.append("response", token);
  if (remoteIp && remoteIp !== "unknown") body.append("remoteip", remoteIp);

  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body,
  });

  if (!response.ok) return false;
  const result = (await response.json()) as { success: boolean };
  return result.success === true;
}
