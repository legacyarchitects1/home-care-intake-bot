import { getAgencyBranding, getAgencyConfig } from "./agencyConfigs";
import { generateIntakeAssessment } from "./ai";
import { sendCoordinatorEmail } from "./email";
import { logSubmission } from "./log";
import { checkRateLimit } from "./rateLimit";
import { verifyTurnstileToken } from "./turnstile";
import type { AgeBand, Env, IntakeSubmission, PaymentType, Relationship } from "./types";

// CORS is intentionally wide open (any origin): this API is meant to be
// called from the /api/submit and /api/config endpoints by a widget
// embedded on arbitrary third-party agency websites, none of which are
// known in advance. There's no cookie/session auth anywhere in this app for
// a permissive CORS policy to put at risk — every request is independently
// validated on its own merits (rate limit, Turnstile if configured, field
// validation), not trusted because of its Origin header.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
};

const RELATIONSHIPS: Relationship[] = ["self", "family_member", "other"];
const AGE_BANDS: AgeBand[] = ["under_18", "18_64", "65_plus"];
const PAYMENT_TYPES: PaymentType[] = ["medicaid", "medicare", "private_pay", "not_sure"];

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
      ...SECURITY_HEADERS,
      ...extraHeaders,
    },
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Validates the raw request body into a well-formed IntakeSubmission.
 * This is the data-minimization boundary: only these seven fields can ever
 * reach the AI call, the email, or the log. There is deliberately no path
 * for a caller to submit SSN, diagnosis, or insurance ID number — those
 * fields simply don't exist in the type, and anything extra in the request
 * body is silently dropped here, not forwarded.
 */
function validateSubmission(body: unknown): IntakeSubmission | string {
  if (typeof body !== "object" || body === null) return "Request body must be a JSON object.";
  const b = body as Record<string, unknown>;

  if (!isNonEmptyString(b.agencyId)) return "agencyId is required.";
  if (!isNonEmptyString(b.name)) return "name is required.";
  if (!isNonEmptyString(b.contact)) return "contact is required.";
  if (!isNonEmptyString(b.livingSituation)) return "livingSituation is required.";
  if (!isNonEmptyString(b.careNeeds)) return "careNeeds is required.";
  if (!RELATIONSHIPS.includes(b.relationship as Relationship))
    return `relationship must be one of: ${RELATIONSHIPS.join(", ")}.`;
  if (!AGE_BANDS.includes(b.ageBand as AgeBand))
    return `ageBand must be one of: ${AGE_BANDS.join(", ")}.`;
  if (!PAYMENT_TYPES.includes(b.paymentType as PaymentType))
    return `paymentType must be one of: ${PAYMENT_TYPES.join(", ")}.`;

  return {
    agencyId: b.agencyId as string,
    name: (b.name as string).trim().slice(0, 200),
    contact: (b.contact as string).trim().slice(0, 200),
    relationship: b.relationship as Relationship,
    livingSituation: (b.livingSituation as string).trim().slice(0, 500),
    careNeeds: (b.careNeeds as string).trim().slice(0, 1000),
    paymentType: b.paymentType as PaymentType,
    ageBand: b.ageBand as AgeBand,
  };
}

async function handleGetConfig(agencyId: string): Promise<Response> {
  const branding = getAgencyBranding(agencyId);
  if (!branding) return json({ error: "Unknown agency." }, 404);
  return json(branding);
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  // Rate limit before doing any real work — this is the check that protects
  // against scripted abuse racking up real OpenAI/Resend costs, so it needs
  // to run first, cheaply, before JSON parsing or anything else.
  const rateLimitResult = await checkRateLimit(env, request);
  if (!rateLimitResult.allowed) {
    return json(
      { error: "Too many submissions. Please try again shortly." },
      429,
      { "Retry-After": String(rateLimitResult.retryAfterSeconds) },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  if (env.TURNSTILE_SECRET_KEY) {
    const token = typeof (body as Record<string, unknown>)?.turnstileToken === "string"
      ? ((body as Record<string, unknown>).turnstileToken as string)
      : undefined;
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const verified = await verifyTurnstileToken(token, env.TURNSTILE_SECRET_KEY, ip);
    if (!verified) {
      return json({ error: "Bot verification failed. Please reload and try again." }, 403);
    }
  }

  const submissionOrError = validateSubmission(body);
  if (typeof submissionOrError === "string") {
    return json({ error: submissionOrError }, 400);
  }
  const submission = submissionOrError;

  const agency = getAgencyConfig(submission.agencyId);
  if (!agency) return json({ error: "Unknown agency." }, 404);

  let ai;
  try {
    ai = await generateIntakeAssessment(submission, agency, env.OPENAI_API_KEY);
  } catch (err) {
    console.error("OpenAI call failed:", err);
    return json(
      { error: "We couldn't process your submission right now. Please try again in a moment." },
      502,
    );
  }

  const submittedAt = new Date().toISOString();
  const id = crypto.randomUUID();

  let emailDelivered = true;
  try {
    await sendCoordinatorEmail(submission, ai, agency, submittedAt, env.RESEND_API_KEY);
  } catch (err) {
    // Don't fail the whole request over email delivery — the client still
    // gets their message and the submission is still logged for compliance
    // and manual follow-up. But this needs to be loud in the logs.
    console.error("Resend email delivery failed:", err);
    emailDelivered = false;
  }

  try {
    await logSubmission(env, {
      id,
      timestamp: submittedAt,
      agencyId: submission.agencyId,
      submission,
      ai,
      emailDelivered,
    });
  } catch (err) {
    console.error("Compliance log write failed:", err);
  }

  return json({
    clientMessage: ai.clientMessage,
    disclaimer:
      "This is not a medical or insurance determination. A licensed intake coordinator will contact you.",
    emailDelivered,
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: { ...CORS_HEADERS, ...SECURITY_HEADERS } });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/config/")) {
      const agencyId = url.pathname.slice("/api/config/".length);
      return handleGetConfig(agencyId);
    }

    if (request.method === "POST" && url.pathname === "/api/submit") {
      return handleSubmit(request, env);
    }

    // Everything else (widget.js, the demo page) is served as a static asset.
    return env.ASSETS.fetch(request);
  },
};
