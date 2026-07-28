# CLAUDE.md — home-care-intake-bot

## Brand voice — there isn't one, by design

This project is **white-label**: it serves multiple home care agencies,
each with their own name, branding, and coordinator email — not a single
brand voice to memorize. **Don't invent or assume a fixed voice here.**

Before generating or editing any client-facing content (the widget's
copy, an agency confirmation email, anything in `src/email.ts` or
`public/widget.js`), the actual source of truth is whichever agency's
config file in `configs/*.json` is relevant — `agencyName`, `tagline`,
and `servicesOffered` are the per-agency voice inputs, loaded through
`getAgencyConfig()` / `getAgencyBranding()` in `src/agencyConfigs.ts`.
If asked to add a new agency or change existing copy, read that agency's
config first rather than defaulting to whatever tone feels natural.

The one thing that *is* fixed across every agency, non-negotiable, not a
style choice: the compliance posture in `SECURITY.md` and
`COMPLIANCE.md`. In particular:
- The 7-field intake schema (name, contact, relationship, living
  situation, care needs, payment type, age range) is deliberately the
  ceiling of what this system ever collects — never add a field for SSN,
  diagnosis, or insurance ID number, and never let free-text fields drift
  toward soliciting them.
- The disclaimer *"This is not a medical or insurance determination. A
  licensed intake coordinator will contact you."* appears at chat start,
  after the AI's reply, and in every coordinator email — keep it there in
  any content changes.
- **Read `COMPLIANCE.md` before assuming real client data can flow through
  this system** — BAAs with OpenAI and Resend weren't confirmed in place as
  of the last review; that status may have changed since, but don't assume
  it has without checking.

## Project overview

Single Cloudflare Worker: serves the embeddable `public/widget.js` as a
static asset and the `/api/*` backend. See `README.md` for architecture,
deploy steps, and required secrets; `SECURITY.md` for implemented controls;
`COMPLIANCE.md` for the HIPAA/SOC2 gap analysis.

```bash
npm install
npx tsc --noEmit          # type-check
npx wrangler dev --local  # local dev server (needs .dev.vars, see README)
```

No CI/CD pipeline exists for this repo — deployment is manual
(`wrangler deploy`), so pushes to `main` have no automatic live effect.
