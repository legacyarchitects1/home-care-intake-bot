/**
 * AES-256-GCM encryption for data at rest in KV, using the Web Crypto API
 * (available natively in the Workers runtime — no dependency needed).
 *
 * LOG_ENCRYPTION_KEY must be a base64-encoded 32-byte (256-bit) key.
 * Generate one with: openssl rand -base64 32
 */

export interface EncryptedPayload {
  iv: string; // base64
  data: string; // base64 ciphertext (includes GCM auth tag)
}

async function importKey(base64Key: string): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(base64Key), (c) => c.charCodeAt(0));
  if (raw.byteLength !== 32) {
    throw new Error(
      `LOG_ENCRYPTION_KEY must decode to exactly 32 bytes (got ${raw.byteLength}). Generate one with: openssl rand -base64 32`,
    );
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function bufferToBase64(buffer: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;
}

export async function encryptString(plaintext: string, base64Key: string): Promise<EncryptedPayload> {
  const key = await importKey(base64Key);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext),
  );
  return {
    iv: bufferToBase64(iv.buffer),
    data: bufferToBase64(ciphertext),
  };
}

export async function decryptString(payload: EncryptedPayload, base64Key: string): Promise<string> {
  const key = await importKey(base64Key);
  const iv = new Uint8Array(base64ToBuffer(payload.iv));
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    key,
    base64ToBuffer(payload.data),
  );
  return new TextDecoder().decode(plaintext);
}
