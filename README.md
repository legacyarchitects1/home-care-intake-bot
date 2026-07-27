# Home Care Intake Bot

A white-label, embeddable AI intake chatbot for home care agencies. A prospective
client (or a family member) answers a short guided sequence of questions via a
chat widget on the agency's own website. On submission, the system:

1. Calls OpenAI (`gpt-4o-mini`) once to produce a plain-English eligibility read,
   a warm reply for the client, and an internal summary for staff.
2. Emails the agency's intake coordinator (via Resend) with the full submission
   and the AI summary.
3. Logs the submission (timestamped) to Cloudflare KV for compliance record-keeping.

It's built as a single Cloudflare Worker: the Worker serves both the embeddable
`widget.js` (as a static asset) and the `/api/*` backend, so there's exactly one
thing to deploy.

## Why the chat is scripted, not free-form

The widget asks a fixed sequence of 7 questions (name, contact, who it's for,
living situation, care needs, payment type, age range) rather than letting the
model freely converse. Two reasons:

- **Compliance by construction.** SSN, diagnosis, and insurance ID number simply
  aren't fields that exist anywhere in the code — there's no way for a free-form
  conversation to accidentally solicit them. See `validateSubmission()` in
  `src/index.ts`: anything outside the seven whitelisted fields is silently
  dropped before it ever reaches the AI call, the email, or the log.
- **Reliability.** This mirrors the pattern already proven in Damon's Make.com
  automations (Home Care Transfer, Financial Health Check): collect structured
  answers first, then make exactly one LLM call to reason over the complete
  picture. A single well-scoped call is far more predictable than a multi-turn
  agent deciding what to ask next.

## Project layout

```
src/
  index.ts          Worker entry point — routing, validation, orchestration
  ai.ts             OpenAI call: eligibility read + client message + staff summary
  email.ts          Resend integration — emails the coordinator
  log.ts            KV-based compliance logging
  agencyConfigs.ts  Agency config lookup (see "Adding an agency" below)
  types.ts
configs/
  demo-agency.json  Example agency config (used by the demo page)
public/
  widget.js         The embeddable script — this is what agencies paste in
  index.html         A stand-in "agency website" for testing the embed
```

## Local development

```bash
npm install
npx wrangler dev --local
```

Local dev needs dummy secrets in a `.dev.vars` file (never commit this):

```
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
```

Then open `http://localhost:8787` — that's the demo agency page with the widget
embedded, exactly as a real agency's site would have it.

I already verified locally (with a dummy key, so the OpenAI call fails on
purpose but everything up to it is proven):
- Valid submissions reach the OpenAI call correctly.
- Missing/invalid fields are rejected with a clean 400 before anything else runs.
- Extra fields (e.g. a smuggled `ssn` or `diagnosis`) are silently dropped —
  they never reach the AI call, the email, or the log.

## Deploying (needs your Cloudflare account — I can't do this part)

I don't have your Cloudflare credentials in this sandbox, so these steps are
for you to run:

```bash
npx wrangler login

# Create the KV namespace for compliance logging, then paste the returned
# id into wrangler.toml (replacing REPLACE_WITH_REAL_KV_NAMESPACE_ID):
npx wrangler kv namespace create SUBMISSIONS_LOG

# Set the two secrets (you'll be prompted to paste each value — never put
# these in wrangler.toml or any committed file):
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put RESEND_API_KEY

npx wrangler deploy
```

### What you need before that works end-to-end

- **An OpenAI API key** — new one, doesn't need to be the same as any Make.com
  connection.
- **A Resend account + API key.** For the milestone-1 "one real test submission
  that emails a test inbox" goal, Resend's shared test address
  (`onboarding@resend.dev`) works with zero setup, but it will only deliver to
  the email address on your Resend account — good enough to prove the pipeline.
  For real agency use later, you'll need to verify a sending domain in Resend
  and update `fromEmail` in each agency's config to an address on that domain
  (`configs/demo-agency.json` currently has a placeholder
  `intake@yourdomain.com` that won't send until you do this).

Once deployed, your Worker gets a `*.workers.dev` URL. The demo page and
`/widget.js` are both served from that same URL — no separate hosting needed.

## Adding a new agency (milestone 1)

Add a JSON file to `configs/`, following the shape of `demo-agency.json`
(`agencyId`, `agencyName`, `logoUrl`, `primaryColor`, `textColor`, `tagline`,
`coordinatorEmail`, `coordinatorName`, `fromEmail`, `servicesOffered`), then
register it in the `AGENCIES` map in `src/agencyConfigs.ts`. Redeploy. That's
the whole process for now.

This is intentionally simple and explicitly *not* the final answer — the spec
calls for proving the single-agency pipeline first, then building a real
multi-client config system (KV or D1-backed, editable without a redeploy).
When that's ready, only `agencyConfigs.ts` needs to change; every other file
already goes through `getAgencyConfig()` / `getAgencyBranding()`, so the swap
is contained to one file.

## Embedding on an agency's website

```html
<script src="https://YOUR-WORKER-URL.workers.dev/widget.js" data-agency="demo-agency"></script>
```

That's the entire integration — one script tag, no build step, no dependency
on the agency's own tech stack. `data-agency` selects which config (branding +
coordinator email) the widget uses.

## Compliance notes

- The 7-field schema has no SSN, diagnosis, or insurance ID number field —
  by construction, not by convention.
- The disclaimer *"This is not a medical or insurance determination. A
  licensed intake coordinator will contact you."* is shown at the start of
  every conversation, again after the final AI response, and in the footer of
  every coordinator email.
- Every submission is written to KV with an ISO 8601 timestamp
  (`logSubmission` in `src/log.ts`), keyed as `sub:<agencyId>:<timestamp>:<id>`
  so a future admin view can range-query by agency and date without a database.
- If the coordinator email fails to send, the submission is still logged and
  the client still gets their message — email failure is logged loudly
  (`console.error`, visible via `wrangler tail`) but doesn't silently drop the
  lead. Given what happened with the credit-analysis scenario's webhook, I did
  not want a second thing that fails invisibly.

## What's left for the first milestone

Everything is built and locally verified except the parts that need your
credentials: creating the KV namespace, setting the two secrets, running
`wrangler deploy`, and sending one real submission through to confirm an email
actually lands in a test inbox. Ping me once deployed (or once you've set the
secrets) and I can help verify the live end-to-end run.
