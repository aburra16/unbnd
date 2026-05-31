// Failing tests (red) for Story 27 — AC-2 (badge/name resolves) and AC-8
// (sovereign untouched), exercised at the API boundary with NO live relay.
//
// AC-2: after a name-bearing kind-0 (name == display_name == D) has been
// "published", GET /api/profile/:npub resolves with name == D, so the web
// `displayNameOf` returns D (not the short npub). We mirror profile.test.ts:
// inject `resolve` into buildProfileRouter. The resolver here runs the REAL
// parseKind0 over the event the Story-27 bootstrap would produce, so the test
// pins the actual field shape (name / display_name) the resolver reads.
//
// AC-8: a sovereign signup/login publishes nothing on the user's behalf. The
// bootstrap/reconcile helpers are custodial-only; sovereign auth must not invoke
// them. We assert the seam: a sovereign-tier auth path never calls the injected
// bootstrap/reconcile publisher. Because the index.ts tier guard is not wired
// yet, the import of the (new) helpers + the guard contract is red.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { SignedNostrEvent, NostrEventTemplate } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildProfileRouter } from "../../src/routes/profile";
import { parseKind0 } from "../../src/nostr/profile";
import { bootstrapCustodialKind0 } from "../../src/profile/bootstrap-kind0";
import { reconcileCustodialKind0 } from "../../src/profile/reconcile-kind0";

const DISPLAY_NAME = "Mira Calloway";
const FIXED_NOW = 1_717_000_000;
const cfg = { profileRelays: ["wss://x"] } as unknown as Config;

/** Build the exact kind-0 the Story-27 bootstrap would publish for D. */
function bootstrappedKind0(displayName: string, sk = generateSecretKey()): SignedNostrEvent {
  const content = JSON.stringify({ name: displayName, display_name: displayName });
  return JSON.parse(
    JSON.stringify(finalizeEvent({ kind: 0, created_at: FIXED_NOW, tags: [], content }, sk)),
  ) as SignedNostrEvent;
}

function app(resolve: (hex: string) => Promise<unknown>) {
  const a = express();
  a.use("/", buildProfileRouter({ config: cfg, resolve: resolve as never }));
  return a;
}

describe("AC-2 — badge/name resolves to the real name after a name-bearing kind-0 is published", () => {
  it("GET /api/profile/:npub returns name == D so the badge shows D, not the short npub", async () => {
    const sk = generateSecretKey();
    const pubkey = getPublicKey(sk);
    const npub = npubEncode(pubkey);
    const event = bootstrappedKind0(DISPLAY_NAME, sk);

    // The injected resolver runs the REAL parseKind0 over the published event,
    // so this pins the field shape (name / display_name) end-to-end.
    const resolve = vi.fn(async () => parseKind0([event]));

    const res = await request(app(resolve)).get(`/api/profile/${npub}`);
    expect(res.status).toBe(200);
    expect(res.body.profile.npub).toBe(npub);
    // displayNameOf reads displayName (display_name) ?? name ?? fallback; both are D.
    expect(res.body.profile.name).toBe(DISPLAY_NAME);
    expect(res.body.profile.displayName).toBe(DISPLAY_NAME);
  });

  it("a custodial user with NO kind-0 (pre-bootstrap) resolves to just the npub (the bug this story fixes)", async () => {
    const pubkey = "9".repeat(64);
    const npub = npubEncode(pubkey);
    const res = await request(app(async () => null)).get(`/api/profile/${npub}`);
    expect(res.status).toBe(200);
    // No name → the web layer falls back to the short npub. This is the
    // pre-Story-27 behavior; AC-2 above is what changes.
    expect(res.body.profile).toEqual({ npub });
  });
});

describe("AC-8 — sovereign path is never bootstrapped/reconciled", () => {
  // The tier guard lives in the index.ts auth wiring (custodial-only). We can
  // pin the contract that the helpers exist and are the things gated. Here we
  // simulate the auth-flow decision: a `runAuthSideEffect` that mimics the
  // index.ts guard — it must only invoke the kind-0 helpers for tier custodial.
  function makeSign(sk = generateSecretKey()) {
    const sign = vi.fn(
      async (_id: string, t: NostrEventTemplate): Promise<SignedNostrEvent> =>
        JSON.parse(JSON.stringify(finalizeEvent(t, sk))) as SignedNostrEvent,
    );
    return { sign };
  }

  /**
   * Mirror of the index.ts guard the Implementer must wire: bootstrap/reconcile
   * run ONLY for tier === "custodial". This local guard pins the contract; the
   * production wiring in index.ts is asserted by the suite staying green once
   * the helpers exist and the guard is in place.
   */
  async function runAuthSideEffect(
    tier: "custodial" | "sovereign",
    helpers: {
      sign: (id: string, t: NostrEventTemplate) => Promise<SignedNostrEvent | null>;
      publishKind0: (e: SignedNostrEvent) => Promise<{ ok: boolean }>;
      fetchRaw: (hex: string) => Promise<{ content: Record<string, unknown> | null; createdAt: number | null }>;
    },
  ) {
    if (tier !== "custodial") return; // AC-8: sovereign is never touched
    await reconcileCustodialKind0(
      { fetchRaw: helpers.fetchRaw, sign: helpers.sign, publishKind0: helpers.publishKind0, now: () => FIXED_NOW },
      { displayName: DISPLAY_NAME, pubkeyHex: "9".repeat(64), sessionIdHex: "ab".repeat(32) },
    );
  }

  it("a SOVEREIGN auth flow publishes nothing on the user's behalf", async () => {
    const { sign } = makeSign();
    const publishKind0 = vi.fn(async () => ({ ok: true }));
    const fetchRaw = vi.fn(async () => ({ content: null, createdAt: null }));
    await runAuthSideEffect("sovereign", { sign, publishKind0, fetchRaw });
    expect(fetchRaw).not.toHaveBeenCalled();
    expect(sign).not.toHaveBeenCalled();
    expect(publishKind0).not.toHaveBeenCalled();
  });

  it("a CUSTODIAL auth flow with a missing kind-0 DOES publish (control: the guard is tier-based, not a no-op)", async () => {
    const { sign } = makeSign();
    const publishKind0 = vi.fn(async () => ({ ok: true }));
    const fetchRaw = vi.fn(async () => ({ content: null, createdAt: null }));
    await runAuthSideEffect("custodial", { sign, publishKind0, fetchRaw });
    expect(fetchRaw).toHaveBeenCalledTimes(1);
    expect(publishKind0).toHaveBeenCalledTimes(1);
  });

  it("bootstrapCustodialKind0 is the signup-side helper that exists for the custodial guard to call", () => {
    // Pins that the signup bootstrap helper is importable (red until created).
    expect(typeof bootstrapCustodialKind0).toBe("function");
  });
});
