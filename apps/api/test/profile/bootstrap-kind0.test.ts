// Failing tests (red) for Story 27 — the signup kind-0 bootstrap helper.
// ADR 0027 Decision 4 + Implementation notes, new file
// `apps/api/src/profile/bootstrap-kind0.ts`:
//   bootstrapCustodialKind0({ sign, publishKind0, now }, { displayName, sessionIdHex })
//     - builds content via buildProfileKind0Content(null, { displayName }, displayName)
//       so name == display_name == D (Open Question 1)
//     - buildKind0Template(content, now())
//     - sign(sessionIdHex, template) → SignedNostrEvent | null
//     - publishKind0(signed)  (local awaited; fan-out fire-and-forget inside it)
//     - ALL internal failures (sign null, publish throw, publish { ok:false })
//       are logged + swallowed. Returns void, NEVER throws to the caller — so the
//       signup response (201) is never affected (AC-4, fail-open).
//
// The helper does not exist yet → import fails → red.
//
// Seams INJECTED (no vi.mock of intra-module calls, per the prior gotcha):
//   sign, publishKind0, now (clock).
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { SignedNostrEvent, NostrEventTemplate } from "@unbnd/schemas";
import { bootstrapCustodialKind0 } from "../../src/profile/bootstrap-kind0";

const SIGNUP_EMAIL = "reader@example.com";
const SIGNUP_PASSWORD = "abcdefghij";
const DISPLAY_NAME = "Mira Calloway";
const SESSION_ID_HEX = "ab".repeat(32);
const FIXED_NOW = 1_717_000_000;

/** A wire-realistic server-signing fake: signs the template with a test key. */
function makeSign(sk = generateSecretKey()) {
  const pubkey = getPublicKey(sk);
  const sign = vi.fn(
    async (_sessionIdHex: string, template: NostrEventTemplate): Promise<SignedNostrEvent> =>
      JSON.parse(JSON.stringify(finalizeEvent(template, sk))) as SignedNostrEvent,
  );
  return { sign, pubkey };
}

afterEach(() => vi.clearAllMocks());

describe("bootstrapCustodialKind0 — AC-1: publishes a name-bearing kind-0", () => {
  it("builds, signs, and publishes a kind-0 whose name AND display_name equal the signup displayName", async () => {
    const { sign, pubkey } = makeSign();
    let published: SignedNostrEvent | undefined;
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => {
      published = e;
      return { ok: true as const, id: e.id };
    });

    await bootstrapCustodialKind0(
      { sign, publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, sessionIdHex: SESSION_ID_HEX },
    );

    expect(sign).toHaveBeenCalledTimes(1);
    expect(publishKind0).toHaveBeenCalledTimes(1);
    expect(published).toBeDefined();
    // kind-0, authored by the new user's pubkey.
    expect(published!.kind).toBe(0);
    expect(published!.pubkey).toBe(pubkey);
    // Parsed content carries the chosen name in BOTH fields.
    const content = JSON.parse(published!.content) as Record<string, unknown>;
    expect(content.name).toBe(DISPLAY_NAME);
    expect(content.display_name).toBe(DISPLAY_NAME);
  });

  it("signs via the injected sign with the session id and a kind-0 / tags:[] template", async () => {
    const { sign } = makeSign();
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => ({ ok: true as const, id: e.id }));

    await bootstrapCustodialKind0(
      { sign, publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, sessionIdHex: SESSION_ID_HEX },
    );

    const [sessionIdHex, template] = sign.mock.calls[0]!;
    expect(sessionIdHex).toBe(SESSION_ID_HEX);
    expect(template.kind).toBe(0);
    expect(template.tags).toEqual([]);
    expect(template.created_at).toBe(FIXED_NOW); // injected clock, deterministic
  });

  it("uses publishKind0 (the local-first / profile-relay publisher), not the shared dcosl publish", async () => {
    // We can only see the seam from here: the helper takes a publishKind0 dep and
    // calls it exactly once. The dcosl exclusion is a property of the wired
    // publishKind0 (asserted at the index wiring level), not this pure helper —
    // but the helper must route through the injected publishKind0 and nothing else.
    const { sign } = makeSign();
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => ({ ok: true as const, id: e.id }));
    await bootstrapCustodialKind0(
      { sign, publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, sessionIdHex: SESSION_ID_HEX },
    );
    expect(publishKind0).toHaveBeenCalledTimes(1);
  });
});

describe("bootstrapCustodialKind0 — AC-3: PRIVACY, no email or PII in the published event", () => {
  it("the signup email string appears NOWHERE in the published event (content or tags)", async () => {
    const { sign } = makeSign();
    let published: SignedNostrEvent | undefined;
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => {
      published = e;
      return { ok: true as const, id: e.id };
    });

    await bootstrapCustodialKind0(
      { sign, publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, sessionIdHex: SESSION_ID_HEX },
    );

    // The load-bearing privacy assertion: serialize the WHOLE event and prove
    // the email / password / session token are absent from content AND tags.
    const wholeEvent = JSON.stringify(published);
    expect(wholeEvent).not.toContain(SIGNUP_EMAIL);
    expect(wholeEvent).not.toContain(SIGNUP_PASSWORD);
    expect(wholeEvent).not.toContain(SESSION_ID_HEX);
    // Content holds only the display-name fields (no leaked account fields).
    const content = JSON.parse(published!.content) as Record<string, unknown>;
    expect(content).not.toHaveProperty("email");
    expect(content).not.toHaveProperty("password");
    expect(content).not.toHaveProperty("userId");
    // tags is empty (no PII smuggled into a tag).
    expect(published!.tags).toEqual([]);
  });
});

describe("bootstrapCustodialKind0 — AC-4: fail-open, never throws to the caller", () => {
  it("resolves without throwing when publishKind0 REJECTS (relay down)", async () => {
    const { sign } = makeSign();
    const publishKind0 = vi.fn(async () => {
      throw new Error("relay down");
    });
    await expect(
      bootstrapCustodialKind0(
        { sign, publishKind0, now: () => FIXED_NOW },
        { displayName: DISPLAY_NAME, sessionIdHex: SESSION_ID_HEX },
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when publishKind0 returns { ok: false } (local publish failed)", async () => {
    const { sign } = makeSign();
    const publishKind0 = vi.fn(async () => ({ ok: false as const, reason: "local relay rejected" }));
    await expect(
      bootstrapCustodialKind0(
        { sign, publishKind0, now: () => FIXED_NOW },
        { displayName: DISPLAY_NAME, sessionIdHex: SESSION_ID_HEX },
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing AND never publishes when sign returns null (session-key race)", async () => {
    const sign = vi.fn(async () => null); // wrap gone / NoSessionKeyError → null
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => ({ ok: true as const, id: e.id }));
    await expect(
      bootstrapCustodialKind0(
        { sign, publishKind0, now: () => FIXED_NOW },
        { displayName: DISPLAY_NAME, sessionIdHex: SESSION_ID_HEX },
      ),
    ).resolves.toBeUndefined();
    expect(publishKind0).not.toHaveBeenCalled();
  });

  it("resolves without throwing when sign itself THROWS", async () => {
    const sign = vi.fn(async () => {
      throw new Error("signing boom");
    });
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => ({ ok: true as const, id: e.id }));
    await expect(
      bootstrapCustodialKind0(
        { sign, publishKind0, now: () => FIXED_NOW },
        { displayName: DISPLAY_NAME, sessionIdHex: SESSION_ID_HEX },
      ),
    ).resolves.toBeUndefined();
    expect(publishKind0).not.toHaveBeenCalled();
  });
});
