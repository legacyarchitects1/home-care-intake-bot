import { decryptString, encryptString, type EncryptedPayload } from "./crypto";
import type { AiIntakeResult, Env, IntakeSubmission } from "./types";

export interface SubmissionLogEntry {
  id: string;
  timestamp: string; // ISO 8601
  agencyId: string;
  submission: IntakeSubmission;
  ai: AiIntakeResult;
  emailDelivered: boolean;
}

// What's actually written to KV: either the entry encrypted as a single
// opaque blob, or (only when LOG_ENCRYPTION_KEY isn't configured) the raw
// entry with an explicit marker — never a silent, unmarked plaintext write.
type StoredRecord =
  | { encrypted: true; payload: EncryptedPayload }
  | { encrypted: false; entry: SubmissionLogEntry };

/**
 * Compliance log: every submission, timestamped, kept indefinitely in KV,
 * encrypted at rest with AES-256-GCM whenever LOG_ENCRYPTION_KEY is set.
 *
 * Key format "sub:<agencyId>:<timestamp>:<id>" so a future admin view can
 * range-list by agency and time without a database.
 */
export async function logSubmission(env: Env, entry: SubmissionLogEntry): Promise<void> {
  const key = `sub:${entry.agencyId}:${entry.timestamp}:${entry.id}`;

  let record: StoredRecord;
  if (env.LOG_ENCRYPTION_KEY) {
    const payload = await encryptString(JSON.stringify(entry), env.LOG_ENCRYPTION_KEY);
    record = { encrypted: true, payload };
  } else {
    // Deliberately loud, not a silent degrade — this should be impossible
    // to miss in `wrangler tail` if it's ever hit in a real deployment.
    console.error(
      "SECURITY WARNING: LOG_ENCRYPTION_KEY is not set. Submission log entry " +
        `"${key}" is being stored in PLAINTEXT. Run: wrangler secret put LOG_ENCRYPTION_KEY`,
    );
    record = { encrypted: false, entry };
  }

  await env.SUBMISSIONS_LOG.put(key, JSON.stringify(record));
}

/**
 * Decrypts a raw KV value back into a SubmissionLogEntry. Not used yet
 * (there's no admin view to read the log through today) but kept here,
 * next to the encryption logic, for when that's built.
 */
export async function decodeLogRecord(rawValue: string, env: Env): Promise<SubmissionLogEntry> {
  const record = JSON.parse(rawValue) as StoredRecord;
  if (!record.encrypted) return record.entry;
  if (!env.LOG_ENCRYPTION_KEY) {
    throw new Error("Cannot decrypt: LOG_ENCRYPTION_KEY is not set in this environment.");
  }
  const decrypted = await decryptString(record.payload, env.LOG_ENCRYPTION_KEY);
  return JSON.parse(decrypted) as SubmissionLogEntry;
}
