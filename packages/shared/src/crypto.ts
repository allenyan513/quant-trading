/**
 * Symmetric encryption for secrets at rest (currently the IBKR Flex token).
 *
 * AES-256-GCM with a 32-byte key from HOLDINGS_ENC_KEY (config.holdingsEncKey()),
 * given as base64 or 64-char hex. Ciphertext format: "gcm1:" + base64(iv[12] |
 * tag[16] | ciphertext). decryptSecret tolerates a missing prefix as legacy
 * plaintext, so pre-encryption rows still read (re-encrypted on next write).
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { config } from "./config.js";

const PREFIX = "gcm1:";

function key(): Buffer {
  const raw = config.holdingsEncKey().trim();
  const buf = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(`HOLDINGS_ENC_KEY must decode to 32 bytes (got ${buf.length}); use base64 or 64-hex.`);
  }
  return buf;
}

/** Encrypt a UTF-8 secret → "gcm1:"-prefixed base64 blob. */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
}

/** Decrypt an encryptSecret() blob; returns the input unchanged if it's legacy plaintext. */
export function decryptSecret(payload: string): string {
  if (!payload.startsWith(PREFIX)) return payload;
  const raw = Buffer.from(payload.slice(PREFIX.length), "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const ct = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
