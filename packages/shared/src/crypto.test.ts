import { describe, it, expect, beforeAll } from "vitest";
import { encryptSecret, decryptSecret } from "./crypto.js";

beforeAll(() => {
  // 32-byte key (base64) — key() is read lazily at call time, so setting it here is fine.
  process.env.HOLDINGS_ENC_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("crypto (AES-256-GCM secret encryption)", () => {
  it("round-trips a secret and never exposes the plaintext in the ciphertext", () => {
    const ct = encryptSecret("flex-token-abc123");
    expect(ct.startsWith("gcm1:")).toBe(true);
    expect(ct).not.toContain("flex-token-abc123");
    expect(decryptSecret(ct)).toBe("flex-token-abc123");
  });

  it("produces different ciphertext each call (random IV)", () => {
    expect(encryptSecret("x")).not.toBe(encryptSecret("x"));
  });

  it("treats unprefixed input as legacy plaintext", () => {
    expect(decryptSecret("legacy-plaintext-token")).toBe("legacy-plaintext-token");
  });

  it("rejects tampered / malformed ciphertext (GCM auth)", () => {
    const ct = encryptSecret("secret");
    // flip a char in the payload region → auth tag / decode mismatch → throw
    const tampered = ct.slice(0, 8) + (ct[8] === "A" ? "B" : "A") + ct.slice(9);
    expect(() => decryptSecret(tampered)).toThrow();
    expect(() => decryptSecret("gcm1:bm90LXZhbGlk")).toThrow(); // too short for iv+tag
  });
});
