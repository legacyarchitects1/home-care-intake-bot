import type { AgencyConfig, AiIntakeResult, IntakeSubmission } from "./types";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildCoordinatorEmailHtml(
  submission: IntakeSubmission,
  ai: AiIntakeResult,
  submittedAt: string,
): string {
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#6b7c8c;font-size:13px;white-space:nowrap;">${label}</td><td style="padding:4px 0;font-size:14px;">${escapeHtml(value)}</td></tr>`;

  return `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto;">
  <h2 style="margin:0 0 4px;">New Intake Submission</h2>
  <p style="color:#6b7c8c;font-size:13px;margin:0 0 16px;">Submitted ${escapeHtml(submittedAt)}</p>

  <table cellpadding="0" cellspacing="0">
    ${row("Name", submission.name)}
    ${row("Contact", submission.contact)}
    ${row("Filling out for", submission.relationship)}
    ${row("Living situation", submission.livingSituation)}
    ${row("Care needs", submission.careNeeds)}
    ${row("Payment type", submission.paymentType)}
    ${row("Age range", submission.ageBand)}
  </table>

  <h3 style="margin:20px 0 4px;">AI Summary</h3>
  <p style="font-size:14px;">${escapeHtml(ai.coordinatorSummary)}</p>

  <h3 style="margin:20px 0 4px;">Eligibility Read (not a determination)</h3>
  <p style="font-size:14px;">${escapeHtml(ai.eligibilityNote)}</p>

  <p style="color:#6b7c8c;font-size:12px;margin-top:24px;border-top:1px solid #e3e3e3;padding-top:12px;">
    This is not a medical or insurance determination. A licensed intake coordinator must review and contact the client directly.
  </p>
</div>`.trim();
}

export async function sendCoordinatorEmail(
  submission: IntakeSubmission,
  ai: AiIntakeResult,
  agency: AgencyConfig,
  submittedAt: string,
  resendApiKey: string,
): Promise<void> {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${resendApiKey}`,
    },
    body: JSON.stringify({
      from: `${agency.agencyName} Intake Bot <${agency.fromEmail}>`,
      to: [agency.coordinatorEmail],
      reply_to: submission.contact.includes("@") ? submission.contact : undefined,
      subject: `New Intake: ${submission.name} (${agency.agencyName})`,
      html: buildCoordinatorEmailHtml(submission, ai, submittedAt),
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Resend request failed (${response.status}): ${errorBody}`);
  }
}
