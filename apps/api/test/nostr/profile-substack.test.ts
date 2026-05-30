// Failing tests (red) for Story 20 AC-7 / AC-8 (server parse side) — the
// Substack field on kind-0 metadata. Mirrors apps/api/test/nostr/profile.test.ts
// (parseKind0). Targets ADR 0020 Decision 2: ProfileMeta gains a `substack?: string`
// field, parsed in parseKind0 from `content.substack` and LIGHT-VALIDATED via the
// platform `URL` — only an http(s) URL survives; anything else is dropped at parse
// so a malformed value never reaches the wire (AC-8). The `substack` field and the
// httpUrl validation do not exist yet.
import { describe, expect, it } from "vitest";
import { parseKind0 } from "../../src/nostr/profile";
import type { SignedNostrEvent } from "@unbnd/schemas";

function k0(content: unknown, created_at = 1): SignedNostrEvent {
  return {
    id: "x",
    pubkey: "a".repeat(64),
    sig: "s",
    kind: 0,
    created_at,
    tags: [],
    content: typeof content === "string" ? content : JSON.stringify(content),
  } as SignedNostrEvent;
}

describe("parseKind0 — Substack field (AC-7)", () => {
  it("surfaces a well-formed https Substack URL on the parsed metadata", () => {
    const m = parseKind0([
      k0({ name: "mira", substack: "https://mira.substack.com" }),
    ]);
    expect(m?.substack).toBe("https://mira.substack.com");
  });

  it("accepts a plain http Substack URL", () => {
    const m = parseKind0([k0({ name: "mira", substack: "http://example.com/feed" })]);
    expect(m?.substack).toBe("http://example.com/feed");
  });

  it("leaves substack undefined when kind-0 has no such field", () => {
    const m = parseKind0([k0({ name: "mira", about: "hi" })]);
    expect(m).not.toBeNull();
    expect(m?.substack).toBeUndefined();
  });
});

describe("parseKind0 — malformed Substack dropped at parse (AC-8)", () => {
  it("drops a non-http(s) scheme (e.g. javascript:)", () => {
    const m = parseKind0([
      // eslint-disable-next-line no-script-url
      k0({ name: "mira", substack: "javascript:alert(1)" }),
    ]);
    expect(m).not.toBeNull(); // name still recognised
    expect(m?.substack).toBeUndefined();
  });

  it("drops a value that is not a URL at all", () => {
    const m = parseKind0([k0({ name: "mira", substack: "not a url" })]);
    expect(m?.substack).toBeUndefined();
  });

  it("drops an ftp / non-web scheme", () => {
    const m = parseKind0([k0({ name: "mira", substack: "ftp://files.example.com" })]);
    expect(m?.substack).toBeUndefined();
  });

  it("drops a non-string substack value", () => {
    const m = parseKind0([k0({ name: "mira", substack: 1234 })]);
    expect(m?.substack).toBeUndefined();
  });

  it("a kind-0 whose ONLY field is a malformed substack parses as no metadata", () => {
    // Nothing recognised survives → all-empty → null (matches the existing
    // "no recognised fields → null" rule in parseKind0).
    expect(parseKind0([k0({ substack: "not a url" })])).toBeNull();
  });
});
