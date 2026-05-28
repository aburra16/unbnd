import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { generateSessionToken, tokenToId } from "../../src/auth/sessions";

describe("generateSessionToken", () => {
  it("returns a base64url token decoding to 32 bytes", () => {
    const { token } = generateSessionToken();
    const raw = Buffer.from(token, "base64url");
    expect(raw.length).toBe(32);
  });

  it("stores SHA-256 of the raw token bytes, not the token itself", () => {
    const { token, id } = generateSessionToken();
    const raw = Buffer.from(token, "base64url");
    const expectedId = createHash("sha256").update(raw).digest();
    expect(id.equals(expectedId)).toBe(true);
    // The stored id must not be the raw token — that's the whole point.
    expect(id.equals(raw)).toBe(false);
  });

  it("produces a different token each call", () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a.token).not.toBe(b.token);
  });
});

describe("tokenToId", () => {
  it("maps a cookie token to the SHA-256 of its decoded bytes", () => {
    const { token, id } = generateSessionToken();
    expect(tokenToId(token).equals(id)).toBe(true);
  });
});
