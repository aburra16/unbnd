// Failing tests (red) for Story 27 — the login kind-0 reconciliation helper.
// ADR 0027 Decision 5 + Implementation notes, new file
// `apps/api/src/profile/reconcile-kind0.ts`:
//   reconcileCustodialKind0(
//     { fetchRaw, sign, publishKind0, now },
//     { displayName, pubkeyHex, sessionIdHex },
//   )
//     - const { content, createdAt } = await fetchRaw(pubkeyHex)
//     - if hasResolvableName(content) → DO NOTHING (idempotent, no republish)
//     - else: buildProfileKind0Content(content, { displayName }, displayName)
//       (preserves any substack/website already present), template at
//       created_at = max(now(), createdAt + 1) so the replacement wins, sign,
//       publishKind0.
//     - Best-effort: any failure (fetch throw, sign null/throw, publish
//       throw/{ok:false}) is swallowed; the helper never throws (login is
//       never blocked or failed). (AC-5d)
//
// The helper does not exist yet → import fails → red.
//
// Seams INJECTED (no vi.mock of intra-module calls): fetchRaw, sign, publishKind0, now.
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { SignedNostrEvent, NostrEventTemplate } from "@unbnd/schemas";
import { reconcileCustodialKind0 } from "../../src/profile/reconcile-kind0";

const DISPLAY_NAME = "Mira Calloway";
const FIXED_NOW = 1_717_000_000;

function makeSign(sk = generateSecretKey()) {
  const pubkey = getPublicKey(sk);
  const sign = vi.fn(
    async (_sessionIdHex: string, template: NostrEventTemplate): Promise<SignedNostrEvent> =>
      JSON.parse(JSON.stringify(finalizeEvent(template, sk))) as SignedNostrEvent,
  );
  return { sign, pubkey, sk };
}

afterEach(() => vi.clearAllMocks());

describe("reconcileCustodialKind0 — AC-5a: missing kind-0 → publish name-bearing", () => {
  it("publishes a kind-0 seeded from the DB displayName when no kind-0 exists", async () => {
    const { sign, pubkey } = makeSign();
    let published: SignedNostrEvent | undefined;
    const fetchRaw = vi.fn(async () => ({ content: null, createdAt: null }));
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => {
      published = e;
      return { ok: true as const, id: e.id };
    });

    await reconcileCustodialKind0(
      { fetchRaw, sign, publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, pubkeyHex: pubkey, sessionIdHex: "ab".repeat(32) },
    );

    expect(fetchRaw).toHaveBeenCalledWith(pubkey);
    expect(publishKind0).toHaveBeenCalledTimes(1);
    expect(published!.kind).toBe(0);
    expect(published!.pubkey).toBe(pubkey);
    const content = JSON.parse(published!.content) as Record<string, unknown>;
    expect(content.name).toBe(DISPLAY_NAME);
    expect(content.display_name).toBe(DISPLAY_NAME);
  });
});

describe("reconcileCustodialKind0 — AC-5b: name-less kind-0 → repaired, fields preserved", () => {
  it("repairs a kind-0 that has substack but no name, preserving substack and adding the name", async () => {
    const { sign, pubkey } = makeSign();
    let published: SignedNostrEvent | undefined;
    const fetchRaw = vi.fn(async () => ({
      content: { substack: "https://mira.substack.com" },
      createdAt: 100,
    }));
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => {
      published = e;
      return { ok: true as const, id: e.id };
    });

    await reconcileCustodialKind0(
      { fetchRaw, sign, publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, pubkeyHex: pubkey, sessionIdHex: "ab".repeat(32) },
    );

    expect(publishKind0).toHaveBeenCalledTimes(1);
    const content = JSON.parse(published!.content) as Record<string, unknown>;
    expect(content.name).toBe(DISPLAY_NAME);
    expect(content.display_name).toBe(DISPLAY_NAME);
    // The latent website-but-no-name event is repaired without losing substack.
    expect(content.substack).toBe("https://mira.substack.com");
  });

  it("builds with created_at strictly newer than the fetched event so NIP-01 replacement wins", async () => {
    const { sign, pubkey } = makeSign();
    const future = FIXED_NOW + 10_000; // fetched event is newer than the clock
    let signedTemplate: NostrEventTemplate | undefined;
    const fetchRaw = vi.fn(async () => ({ content: { substack: "https://x.substack.com" }, createdAt: future }));
    const sign2 = vi.fn(async (_id: string, template: NostrEventTemplate) => {
      signedTemplate = template;
      return JSON.parse(JSON.stringify(finalizeEvent(template, generateSecretKey()))) as SignedNostrEvent;
    });
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => ({ ok: true as const, id: e.id }));

    await reconcileCustodialKind0(
      { fetchRaw, sign: sign2, publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, pubkeyHex: pubkey, sessionIdHex: "ab".repeat(32) },
    );

    void sign; // unused in this case
    expect(signedTemplate!.created_at).toBeGreaterThan(future);
  });
});

describe("reconcileCustodialKind0 — AC-5c: good name-bearing kind-0 → idempotent (no republish)", () => {
  it("does NOT sign or publish when a non-empty name already resolves", async () => {
    const { sign } = makeSign();
    const fetchRaw = vi.fn(async () => ({
      content: { name: "Mira Calloway", display_name: "Mira Calloway" },
      createdAt: 100,
    }));
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => ({ ok: true as const, id: e.id }));

    await reconcileCustodialKind0(
      { fetchRaw, sign, publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, pubkeyHex: "9".repeat(64), sessionIdHex: "ab".repeat(32) },
    );

    expect(fetchRaw).toHaveBeenCalledTimes(1);
    expect(sign).not.toHaveBeenCalled();
    expect(publishKind0).not.toHaveBeenCalled();
  });
});

describe("reconcileCustodialKind0 — AC-5d: best-effort, never blocks login", () => {
  it("resolves without throwing when fetchRaw REJECTS", async () => {
    const { sign } = makeSign();
    const fetchRaw = vi.fn(async () => {
      throw new Error("relay read failed");
    });
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => ({ ok: true as const, id: e.id }));
    await expect(
      reconcileCustodialKind0(
        { fetchRaw, sign, publishKind0, now: () => FIXED_NOW },
        { displayName: DISPLAY_NAME, pubkeyHex: "9".repeat(64), sessionIdHex: "ab".repeat(32) },
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing when publishKind0 REJECTS", async () => {
    const { sign } = makeSign();
    const fetchRaw = vi.fn(async () => ({ content: null, createdAt: null }));
    const publishKind0 = vi.fn(async () => {
      throw new Error("relay down");
    });
    await expect(
      reconcileCustodialKind0(
        { fetchRaw, sign, publishKind0, now: () => FIXED_NOW },
        { displayName: DISPLAY_NAME, pubkeyHex: "9".repeat(64), sessionIdHex: "ab".repeat(32) },
      ),
    ).resolves.toBeUndefined();
  });

  it("resolves without throwing AND never publishes when sign returns null (session-key race)", async () => {
    const sign = vi.fn(async () => null);
    const fetchRaw = vi.fn(async () => ({ content: null, createdAt: null }));
    const publishKind0 = vi.fn(async (e: SignedNostrEvent) => ({ ok: true as const, id: e.id }));
    await expect(
      reconcileCustodialKind0(
        { fetchRaw, sign, publishKind0, now: () => FIXED_NOW },
        { displayName: DISPLAY_NAME, pubkeyHex: "9".repeat(64), sessionIdHex: "ab".repeat(32) },
      ),
    ).resolves.toBeUndefined();
    expect(publishKind0).not.toHaveBeenCalled();
  });
});
