import type { AgencyConfig, AiIntakeResult, IntakeSubmission } from "./types";

const SYSTEM_PROMPT = `You are an intake triage assistant for a home care agency. A prospective client (or a family member calling on their behalf) just answered a short set of intake questions on the agency's website. Your job is NOT to make a medical, insurance, or admissions determination — only a licensed intake coordinator can do that. Your job is to give the person a warm, honest, plain-English read on whether their described situation sounds like a fit for what this agency offers, and to draft the internal summary the coordinator will see.

Never guarantee admission, coverage, a specific cost, or a specific timeline. Never give medical, legal, or insurance advice. Never invent facts not present in the submission. Keep language plain, warm, and dignified — no jargon, no corporate tone.

Respond with ONLY a JSON object with exactly these three keys:
{
  "eligibilityNote": "one or two internal sentences for staff: does the described need plausibly match the agency's services, or is it likely outside scope (e.g. needs skilled nursing when the agency only offers non-medical care)? If unclear, say so honestly.",
  "clientMessage": "2-4 warm sentences addressed directly to the person who submitted the form: acknowledge what they shared, give an honest plain-English read on next steps, and set the expectation that a licensed intake coordinator will follow up personally. Never guarantee anything.",
  "coordinatorSummary": "a concise 3-5 sentence internal briefing for the coordinator: who this is for, what they need, their situation, and anything worth flagging before the callback."
}`;

function buildUserPrompt(submission: IntakeSubmission, agency: AgencyConfig): string {
  const relationshipText =
    submission.relationship === "self"
      ? "themselves"
      : submission.relationship === "family_member"
        ? "a family member"
        : "someone they're helping";

  return `Agency: ${agency.agencyName}
What this agency offers: ${agency.servicesOffered}

Submission:
- Name: ${submission.name}
- Filling this out for: ${relationshipText}
- Current living situation: ${submission.livingSituation}
- Care needs described: ${submission.careNeeds}
- Payment/insurance type: ${submission.paymentType}
- Age range: ${submission.ageBand}`;
}

export async function generateIntakeAssessment(
  submission: IntakeSubmission,
  agency: AgencyConfig,
  openaiApiKey: string,
): Promise<AiIntakeResult> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openaiApiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      max_tokens: 600,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(submission, agency) },
      ],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`OpenAI request failed (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as {
    choices: { message: { content: string } }[];
  };
  const raw = data.choices[0]?.message?.content;
  if (!raw) {
    throw new Error("OpenAI response had no content");
  }

  let parsed: Partial<AiIntakeResult>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`OpenAI response was not valid JSON: ${raw}`);
  }

  if (!parsed.eligibilityNote || !parsed.clientMessage || !parsed.coordinatorSummary) {
    throw new Error(`OpenAI response was missing required fields: ${raw}`);
  }

  return parsed as AiIntakeResult;
}
