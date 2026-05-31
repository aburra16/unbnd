import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { TrustProvider } from "../../src/trust";
import { buildTrustRouter, type TrustRouteDeps, type TrustSessionUser } from "../../src/routes/trust";

const SOV: TrustSessionUser = { id: "u", pubkeyHex: "a".repeat(64), tier: "sovereign" };

// CONTRACT MIGRATION (ADR 0026 Decision 1): authChallenge now resolves the full
// unsigned kind-27235 TEMPLATE (was a bare string). The sovereign tests below
// assert the new template contract; the intent (a challenge the user signs) is
// unchanged.
const CHAL_TEMPLATE = {
  kind: 27235,
  created_at: 1,
  tags: [["challenge", "chal"]],
  content: "",
};

function provider(over: Partial<TrustProvider> = {}): TrustProvider {
  return {
    name: "brainstorm",
    weights: vi.fn(async () => new Map()),
    hasScores: vi.fn(async () => false),
    authChallenge: vi.fn(async () => CHAL_TEMPLATE),
    personalize: vi.fn(async () => true),
    ...over,
  } as unknown as TrustProvider;
}

function app(over: { user?: TrustSessionUser | null; trust?: TrustProvider } = {}) {
  const a = express();
  a.use(express.json());
  a.use(
    "/",
    buildTrustRouter({
      sessionUser: vi.fn(async () => ("user" in over ? over.user! : SOV)),
      trust: "trust" in over ? over.trust : provider(),
      // New deps the custodial branch needs (DI). Sovereign tests never touch
      // them, but the router constructor now accepts them.
      config: { personalizeMinFollows: 10 },
      followCount: vi.fn(async () => 0),
      custodialSign: vi.fn(async () => null),
    } as unknown as TrustRouteDeps),
  );
  return a;
}

describe("GET /api/trust/status", () => {
  it("reports hasScores + canPersonalize for a sovereign user", async () => {
    const res = await request(app({ trust: provider({ hasScores: vi.fn(async () => true) }) })).get("/api/trust/status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ enabled: true, hasScores: true, canPersonalize: true });
  });
  it("401 without a session", async () => {
    expect((await request(app({ user: null })).get("/api/trust/status")).status).toBe(401);
  });
  it("custodial below the follow gate cannot personalize", async () => {
    // CONTRACT MIGRATION (ADR 0026 Decision 2): canPersonalize for custodial is
    // now gate-driven, not a hardcoded false. With followCount mocked at 0 and a
    // threshold of 10, the eligibility is still false — but for the new reason
    // (below the gate), so the assertion holds and pins the new contract.
    const res = await request(app({ user: { ...SOV, tier: "custodial" } })).get("/api/trust/status");
    expect(res.body.canPersonalize).toBe(false);
  });
});

describe("GET /api/trust/challenge", () => {
  it("returns the unsigned challenge TEMPLATE for a sovereign user", async () => {
    // CONTRACT MIGRATION (ADR 0026 Decision 1): /challenge returns the server-
    // built template now, not a bare { challenge } string. The web NIP-07-signs
    // this verbatim — behavior preserved, response shape updated.
    const res = await request(app()).get("/api/trust/challenge");
    expect(res.status).toBe(200);
    expect(res.body.template).toMatchObject({ kind: 27235 });
    expect(res.body.template.tags).toContainEqual(["challenge", "chal"]);
  });
  it("403 below_follow_gate for custodial below the gate (not_supported relaxed)", async () => {
    // CONTRACT MIGRATION (ADR 0026): the old hard 400 not_supported for every
    // custodial user is replaced by the gate. Below the threshold the endpoint
    // now returns the typed 403 below_follow_gate.
    const res = await request(app({ user: { ...SOV, tier: "custodial" } })).get("/api/trust/challenge");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_follow_gate");
  });
});

describe("POST /api/trust/personalize", () => {
  it("triggers when the event is signed by the user's own key", async () => {
    const trust = provider();
    const ev = { pubkey: SOV.pubkeyHex, kind: 27235 };
    const res = await request(app({ trust })).post("/api/trust/personalize").send({ event: ev });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, building: true });
    expect(trust.personalize).toHaveBeenCalledWith(SOV.pubkeyHex, ev);
  });
  it("400 when the event pubkey is not the user's", async () => {
    const res = await request(app()).post("/api/trust/personalize").send({ event: { pubkey: "b".repeat(64) } });
    expect(res.status).toBe(400);
  });
  it("502 when the trigger fails", async () => {
    const res = await request(app({ trust: provider({ personalize: vi.fn(async () => false) }) }))
      .post("/api/trust/personalize")
      .send({ event: { pubkey: SOV.pubkeyHex } });
    expect(res.status).toBe(502);
  });
});
