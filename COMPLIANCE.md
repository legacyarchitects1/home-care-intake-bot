# HIPAA / SOC 2 Compliance Status

**This document is not legal advice and does not by itself make this system
HIPAA compliant or SOC 2 certified.** Both are, at their core, organizational
and legal commitments backed by contracts and (for SOC 2) an independent
audit — not something a codebase can self-certify. What follows is an honest
map of what's implemented, what's missing, and — critically — who owns
closing each gap. Items marked **[Damon]** require direct action outside of
code (a vendor agreement, a paid audit, a policy decision) that I cannot do
on your behalf.

## Does this system handle PHI?

Almost certainly yes, or close enough that it should be treated as if it
does. HIPAA's definition of Protected Health Information covers individually
identifiable health information. `careNeeds` and `livingSituation` are
free-text fields — "help getting to dialysis" or "recovering from a stroke,
needs help standing" is health information, and it's attached to a name and
contact method in the same submission. The schema deliberately excludes SSN,
diagnosis codes, and insurance ID numbers, but that reduces *severity*, not
*applicability* — a name plus a described health-related need is enough to
trigger HIPAA if the home care agency using this widget is a covered entity
(most are, if they bill Medicare/Medicaid or otherwise engage in HIPAA
transactions), which would make Damon's business a "business associate"
handling PHI on the agency's behalf.

**Practical implication**: treat every submission as PHI. The technical
controls in SECURITY.md (encryption at rest, data minimization, access
control) are built on that assumption already. The gaps below are what's
still needed to make that assumption *legally* sound, not just technically
reasonable.

## HIPAA gaps

### Business Associate Agreements — **[Damon]**, not started

A signed BAA is needed in both directions:
1. **Damon's business ↔ each home care agency** — the agency is the covered
   entity, Damon's business is the business associate handling PHI on their
   behalf. Standard BAA template, but it needs to actually be signed before
   any agency sends real client data through this system.
2. **Damon's business ↔ every subprocessor that touches the data**:
   - **OpenAI**: offers a BAA, but only through their business/enterprise
     API terms — not available on a default API key signup. Requires
     applying directly, and typically requires enabling zero-data-retention
     on the API account. **Action needed**: apply for OpenAI's BAA program
     before sending any real submission through the current `OPENAI_API_KEY`.
   - **Resend**: I don't have confirmed knowledge that Resend currently
     offers a HIPAA BAA program at all — they're a newer company and it
     isn't advertised the way it is for larger providers. **Action needed**:
     confirm directly with Resend's team. If they don't offer one, the email
     step needs to move to a provider that does (SendGrid and AWS SES both
     have established BAA programs) — that's a contained code change in
     `src/email.ts` if/when needed.
   - **Cloudflare**: offers BAAs, but coverage is scoped to specific
     services and plan tiers. **Action needed**: confirm with Cloudflare
     whether your current plan and the specific products used here
     (Workers, KV) are included in their HIPAA-eligible service list.

Until all of the above are in place, **no real client PHI should go through
this system** — that includes the milestone-1 "test submission" goal, which
should stay synthetic/fake test data until BAAs are signed.

### Administrative safeguards — **[Damon]**, not started

Workforce training, a sanctions policy for violations, a contingency/backup
plan, a formal risk assessment performed with qualified counsel or a
compliance consultant. None of this is code — it's organizational process
that needs to exist even for a company of one.

### Technical safeguards — partially implemented

| Safeguard | Status |
|---|---|
| Access control | Partial — no user auth exists yet (see below); Cloudflare account IAM is the only boundary today |
| Audit controls | Partial — every submission is logged with a timestamp, but there's no access-review process for *who read* a log entry, because there's no admin surface yet |
| Integrity | Implemented — AES-GCM's auth tag detects tampering with stored entries |
| Transmission security | Implemented — TLS via Cloudflare |
| Encryption at rest | Implemented — see SECURITY.md |

### Physical safeguards

Inherited from Cloudflare, OpenAI, and Resend's own data center compliance —
not something this codebase controls directly. Worth confirming each
vendor's own compliance posture as part of vendor due diligence.

## SOC 2 gaps

SOC 2 (Type I or Type II) is an audit against the AICPA's Trust Services
Criteria, performed by a licensed CPA firm. Security is the mandatory
criterion; Availability, Confidentiality, Processing Integrity, and Privacy
are optional add-ons. Realistically, for a pre-revenue product with one demo
agency and no signed customers yet, **pursuing a SOC 2 audit right now is
premature** — Type II audits typically require 3–12 months of evidence
against documented policies, and the audit engagement itself commonly runs
five to six figures. That's worth knowing before committing budget/time to
it at this stage. What's worth doing now instead: build the underlying
controls so that pursuing SOC 2 later — once there's real customer demand
requiring it — is a matter of documentation and audit engagement, not a
rebuild.

**[Damon]** — organizational items no code change can satisfy:
- A named security officer / responsible individual
- Documented policies: access control, change management, incident
  response, vendor management, data retention/deletion
- Employee background checks (even for a company of one, this becomes
  relevant the moment there's a second person with system access)
- The actual audit engagement with a CPA firm

**Implemented / mapped to common SOC 2 controls today**:
- Encryption at rest and in transit (see SECURITY.md)
- Secrets management via a dedicated secret store, never in source
- Rate limiting / abuse protection
- Audit logging of data-changing events (submissions)

**Gap, buildable if/when prioritized**:
- Centralized, queryable audit log with retention policy (today's KV log
  is written correctly but has no admin view, no retention/deletion
  process, and no access-review trail)
- Monitoring/alerting (see SECURITY.md's logging gap)
- An actual incident response *runbook*, not just logging

## MFA / RBAC

There is no login anywhere in this system today — the widget is
intentionally public/unauthenticated, and there's no admin dashboard for
staff to log into. **MFA and RBAC have nothing to attach to yet.** Before
building either, the real question is whether an admin dashboard (to view
submissions, manage per-agency config, review the audit log) is wanted as a
feature — that's a genuine architectural addition, not a small patch, and
per the instruction to confirm before major changes: **I'm holding off on
building it until that's confirmed.** If wanted, that dashboard is the
natural home for authenticated access, role-based permissions (e.g., agency
staff can only see their own agency's submissions), and MFA on login.

## Bottom line / suggested sequencing

1. **Now, before any real data flows through this**: confirm OpenAI's BAA
   program covers the API key in use, and resolve the Resend BAA question
   (switch providers if needed) — this blocks real client use regardless of
   anything else.
2. **Before selling to a real agency**: signed BAA between Damon's business
   and that agency.
3. **When there's a second person touching the system, or real customer
   demand for it**: admin dashboard with auth/RBAC/MFA, formal policies,
   monitoring/alerting.
4. **When there's real revenue and a customer requiring it**: SOC 2 audit
   engagement.

Steps 1–2 are the actual blockers on doing this for real. Steps 3–4 are
appropriately deferred until there's a concrete reason to pay their cost.
