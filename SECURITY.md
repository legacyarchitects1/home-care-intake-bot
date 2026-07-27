# Security

This document describes the actual security posture of this codebase as it
stands today — what's implemented, what's deliberately out of scope, and
what's a known gap. It's written to be checked against the code, not aspirational.

## Data minimization (the primary control)

The single biggest security decision in this app is upstream of encryption
or access control: **the schema makes certain data impossible to collect in
the first place.** `IntakeSubmission` in `src/types.ts` has exactly seven
fields — name, contact, relationship, living situation, care needs
(free text, general description), payment type, age range. There is no SSN
field, no diagnosis field, no insurance ID number field, anywhere in the
type system. `validateSubmission()` in `src/index.ts` silently drops
anything in the request body outside those seven fields before it reaches
the AI call, the email, or the log — verified by hand (see commit history):
a smuggled `ssn`/`diagnosis` field in the POST body never appears downstream.

This matters more than any control below it: you can't leak, misconfigure,
or forget to encrypt data you never collected.

## Transport security

All traffic terminates on Cloudflare's edge (TLS 1.2+/HTTPS enforced by the
platform) before reaching the Worker. There is no unencrypted path — Workers
don't have a raw HTTP listener to misconfigure.

## Secrets management

`OPENAI_API_KEY`, `RESEND_API_KEY`, `LOG_ENCRYPTION_KEY`, and (optionally)
`TURNSTILE_SECRET_KEY` are all set via `wrangler secret put`, which stores
them encrypted in Cloudflare's secret store — never in `wrangler.toml`, never
in the repo, never in `.dev.vars` (which is gitignored). Application code
never logs a secret value.

## Encryption at rest

Two layers:
- **Platform level**: Cloudflare encrypts all KV data at rest as an
  infrastructure guarantee, independent of anything this app does.
- **Application level**: every submission log entry is additionally
  encrypted with AES-256-GCM (`src/crypto.ts`) before being written to KV,
  using a key that never leaves Worker secrets. This means raw submission
  text (name, contact, care needs) isn't readable in cleartext by anyone
  with Cloudflare dashboard/API access to the account — only by something
  holding `LOG_ENCRYPTION_KEY`.
  - Verified by hand: encrypt → decrypt round-trips to the exact original
    plaintext; the ciphertext contains no recoverable trace of the
    plaintext; decrypting with the wrong key throws rather than silently
    returning corrupted-but-plausible data.
  - **If `LOG_ENCRYPTION_KEY` is not set**, `log.ts` falls back to storing
    entries in plaintext — but logs a `console.error` SECURITY WARNING on
    every single write, so this is loud in `wrangler tail`, not a silent
    degrade. Set the key before handling real submissions.
  - **Key rotation is not implemented.** Rotating `LOG_ENCRYPTION_KEY` makes
    every previously-written entry undecryptable unless you retain the old
    key alongside the new one. There's no envelope-encryption/multi-key
    scheme here — deliberately, to keep this contained. If key rotation
    becomes a real requirement, that's a follow-up task, not something
    silently handled today.

## Access control

There is currently **no authentication or RBAC anywhere in this system** —
by design, because there's no admin surface yet. `/api/submit` and
`/api/config/:agencyId` are intentionally public and unauthenticated (any
visitor to an embedding agency's website needs to reach them). The only
"access control" that exists today is Cloudflare account-level access to
view raw KV contents, secrets, and deploy the Worker — which is your
Cloudflare account's own IAM, not something this codebase layers on top of.

If/when an admin dashboard is built (to view submissions, manage agency
configs, etc.), that's where real RBAC and MFA belong. See COMPLIANCE.md.

## Abuse protection

- **Rate limiting** (`src/rateLimit.ts`): a fixed 10-minute window, 5
  requests per IP, enforced before any OpenAI/Resend call is made — this is
  what stops a scripted attacker from running up real API costs or spamming
  a coordinator's inbox. Verified by hand: the 6th request within a window
  from the same IP gets a `429` with `Retry-After`.
  - This is intentionally simple (fixed window via KV, not a sliding window
    on Durable Objects) — good enough to stop unsophisticated abuse at low
    traffic; not millisecond-precise under concurrent bursts. Worth
    revisiting if real traffic volume grows.
- **Bot verification** (`src/turnstile.ts`): optional Cloudflare Turnstile
  check, only enforced when `TURNSTILE_SECRET_KEY` is configured — safe to
  deploy without it, easy to turn on later. See README for setup.

## Input handling / injection considerations

- Free-text fields (`careNeeds`, `livingSituation`) are sent directly into
  the OpenAI prompt. A visitor could attempt prompt injection (e.g., trying
  to make the model claim guaranteed eligibility). Impact is bounded: the
  AI's output is explicitly framed as advisory ("not a determination," per
  the disclaimer shown in the widget and every coordinator email) and is
  HTML-escaped before being embedded in the coordinator email
  (`escapeHtml()` in `src/email.ts`), so a successful injection can distort
  the AI's *text*, not execute code, exfiltrate secrets, or corrupt the
  email's structure.
- All string fields are length-capped server-side (`validateSubmission()`)
  regardless of what the widget sends, so the API doesn't trust client-side
  limits.

## CORS

`Access-Control-Allow-Origin: *` is intentional, not an oversight — the
widget is meant to be embedded on arbitrary third-party agency websites
unknown in advance. There's no cookie/session auth anywhere for a permissive
CORS policy to put at risk; every request is validated independently
(rate limit, optional bot-check, field validation) regardless of Origin.

## Logging & monitoring

- Every submission is logged to KV with an ISO 8601 timestamp, encrypted
  (see above), keyed `sub:<agencyId>:<timestamp>:<id>` for future range
  queries.
- Errors (OpenAI failures, Resend failures, log-write failures) are all
  `console.error`'d, visible via `wrangler tail` or the Cloudflare dashboard.
- **Gap**: there's no alerting. If Resend starts failing repeatedly, nobody
  gets paged — it just accumulates in logs until someone looks. Worth adding
  if this goes into real production use (e.g., an alert email to Damon after
  N consecutive failures).
- **Gap**: no dashboard/metrics beyond Cloudflare's built-in Workers
  analytics.

## Dependency hygiene

`npm audit` currently reports vulnerabilities in transitive dev
dependencies (via `wrangler`'s own toolchain) — none in application runtime
code, since the app has zero runtime dependencies (all API calls use native
`fetch`). Worth an occasional `npm audit` / `wrangler` upgrade pass; not
urgent since none are in the deployed Worker's own code path.

## Reporting a security issue

This is a small, pre-production project without a formal disclosure
process yet. For now: contact Damon directly.
