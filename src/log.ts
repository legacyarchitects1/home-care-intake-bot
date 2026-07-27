import type { AiIntakeResult, Env, IntakeSubmission } from "./types";

export interface SubmissionLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  agencyId: string;
  submission: IntakeSubmission;
  ai: AiIntakeResult;
  emailDelivered: boolean;
}

/**
 * Compliance log: every submission, timestamped, kept indefinitely in KV.
 * Key format "sub:<agencyId>:<timestamp>:<id>" so a future admin view can
 * range-list by agency and time without a database.
 */
export async function logSubmission(env: Env, entry: SubmissionLogEntry): Promise<void> {
  const key = `sub:${entry.agencyId}:${entry.timestamp}:${entry.id}`;
  await env.SUBMISSIONS_LOG.put(key, JSON.stringify(entry));
}
