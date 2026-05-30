import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { TrustProvider } from "../../src/trust";
import { buildTrustRouter, type TrustSessionUser } from "../../src/routes/trust";

const SOV: TrustSessionUser = { id: "u", pubkeyHex: "a".repeat(64), tier: "sovereign" };

function provider(over: Partial<TrustProvider> = {}): TrustProvider {
  return {
    name: "brainstorm",
    weights: vi.fn(async () => new Map()),
    hasScores: vi.fn(async () => false),
    authChallenge: vi.fn(async () => "chal"),
    personalize: vi.fn(async () => true),
    ...over,
  };
}

function app(over: { user?: TrustSessionUser | null; trust?: TrustProvider } = {}) {
  const a = express();
  a.use(express.json());
  a.use(
    "/",
    buildTrustRouter({
      sessionUser: vi.fn(async () => ("user" in over ? over.user! : SOV)),
      trust: "trust" in over ? over.trust : provider(),
    }),
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
  it("custodial cannot personalize", async () => {
    const res = await request(app({ user: { ...SOV, tier: "custodial" } })).get("/api/trust/status");
    expect(res.body.canPersonalize).toBe(false);
  });
});

describe("GET /api/trust/challenge", () => {
  it("returns a challenge for a sovereign user", async () => {
    const res = await request(app()).get("/api/trust/challenge");
    expect(res.status).toBe(200);
    expect(res.body.challenge).toBe("chal");
  });
  it("400 for custodial", async () => {
    expect((await request(app({ user: { ...SOV, tier: "custodial" } })).get("/api/trust/challenge")).status).toBe(400);
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
