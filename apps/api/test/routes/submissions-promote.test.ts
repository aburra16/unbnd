// Story 30 / ADR 0031 — trust-gated promotion: the curator GATE + the enqueue
// seam. All DI-driven (no intra-module vi.mock): inject the fixture
// TrustProvider, a fake session, a fake enqueue. RED until the route gains
// `POST /api/submissions/:slug/promote`, the `trust` + `enqueuePromotion` deps,
// and `config.curatorThreshold`.
//
// AC-1 gate is the SESSION user's own house-PoV weight ≥ threshold (the same
// `weights(houseObserverHex,[hex])` seam Story 25 uses). AC-3 the gate is
// server-enforced (not UI-hidden). AC-5 threshold is env-configurable. AC-6
// honest degrade → gate CLOSES. AC-7 idempotent double-promote.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { asHexPubkey, type SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import {
  buildSubmissionsRouter,
  type SubmissionsDeps,
  type SubmissionsSessionUser,
} from "../../src/routes/submissions";

const LIB = asHexPubkey("1".repeat(63) + "a");
// House observer vantage (the gate is always the HOUSE vantage, AC-1).
const HOUSE = "b".repeat(64);
// Curator above the gate; a mid-weight user; a below-gate user.
const ABOVE = "c".repeat(64);
const MID = "d".repeat(64);
const BELOW = "e".repeat(64);

function cfg(over: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    ...over,
  } as unknown as Config;
}

// Fixture: HOUSE trusts ABOVE at 0.9, MID at 0.4, and does not trust BELOW.
function fixtureTrust() {
  return new FixtureTrustProvider({
    weights: { [HOUSE]: { [ABOVE]: 0.9, [MID]: 0.4 } },
  });
}

const userAbove: SubmissionsSessionUser = { id: "u1", pubkeyHex: ABOVE, tier: "sovereign" };
const userMid: SubmissionsSessionUser = { id: "u2", pubkeyHex: MID, tier: "sovereign" };
const userBelow: SubmissionsSessionUser = { id: "u3", pubkeyHex: BELOW, tier: "sovereign" };

type EnqueueResult = { status: "queued" | "already" };

function makeApp(over: Partial<SubmissionsDeps> = {}, config: Config = cfg()) {
  const enqueuePromotion = vi.fn(
    async (_slug: string, _requestedBy: string): Promise<EnqueueResult> => ({ status: "queued" }),
  );
  const deps = {
    config,
    sessionUser: vi.fn(async () => userAbove),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => [] as SignedNostrEvent[]),
    custodialSign: vi.fn(async () => null),
    trust: fixtureTrust(),
    enqueuePromotion,
    ...over,
  } as unknown as SubmissionsDeps & { enqueuePromotion: typeof enqueuePromotion };
  const app = express();
  app.use(express.json());
  app.use("/", buildSubmissionsRouter(deps as SubmissionsDeps));
  return { app, deps, enqueuePromotion };
}

describe("POST /api/submissions/:slug/promote — curator gate (AC-1, AC-3)", () => {
  it("above-threshold session user → enqueues once + 200", async () => {
    const { app, enqueuePromotion } = makeApp({ sessionUser: vi.fn(async () => userAbove) });
    const res = await request(app).post("/api/submissions/some-slug/promote");
    expect(res.status).toBe(200);
    expect(enqueuePromotion).toHaveBeenCalledTimes(1);
    expect(enqueuePromotion).toHaveBeenCalledWith("some-slug", ABOVE);
  });

  it("anon (no session) → 401, no enqueue", async () => {
    const { app, enqueuePromotion } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/submissions/some-slug/promote");
    expect(res.status).toBe(401);
    expect(enqueuePromotion).not.toHaveBeenCalled();
  });

  it("below-threshold session user → 403 below_gate, server-enforced (NOT just UI-hidden), no enqueue", async () => {
    const { app, enqueuePromotion } = makeApp({ sessionUser: vi.fn(async () => userBelow) });
    const res = await request(app).post("/api/submissions/some-slug/promote");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
    expect(enqueuePromotion).not.toHaveBeenCalled();
  });

  it("gate is the HOUSE vantage on the SESSION user's own weight (AC-1): a user absent from the house weight map is below the gate", async () => {
    // BELOW is absent from the house weight map → weight 0 → below the gate.
    const { app, enqueuePromotion } = makeApp({ sessionUser: vi.fn(async () => userBelow) });
    const res = await request(app).post("/api/submissions/x/promote");
    expect(res.status).toBe(403);
    expect(enqueuePromotion).not.toHaveBeenCalled();
  });
});

describe("POST /api/submissions/:slug/promote — honest degrade closes the gate (AC-6)", () => {
  it("no trust provider injected → weight 0 → gate CLOSES (403), no enqueue", async () => {
    const { app, enqueuePromotion } = makeApp({ trust: undefined });
    const res = await request(app).post("/api/submissions/x/promote");
    expect(res.status).toBe(403);
    expect(enqueuePromotion).not.toHaveBeenCalled();
  });

  it("empty weights (observer has no scores over the caller) → weight 0 → 403", async () => {
    const empty = new FixtureTrustProvider({ weights: {} });
    const { app, enqueuePromotion } = makeApp({ trust: empty });
    const res = await request(app).post("/api/submissions/x/promote");
    expect(res.status).toBe(403);
    expect(enqueuePromotion).not.toHaveBeenCalled();
  });

  it("no house observer configured → gate CLOSES (403), seam never throws", async () => {
    const { app, enqueuePromotion } = makeApp({}, cfg({ houseObserverPubkey: undefined }));
    const res = await request(app).post("/api/submissions/x/promote");
    expect(res.status).toBe(403);
    expect(enqueuePromotion).not.toHaveBeenCalled();
  });

  it("a throwing trust seam still closes the gate without surfacing a 500", async () => {
    const throwing = {
      name: "fixture" as const,
      weights: vi.fn(async () => {
        throw new Error("trust backend down");
      }),
      hasScores: vi.fn(async () => false),
      followers: vi.fn(async () => new Map()),
      authChallenge: vi.fn(async () => null),
      personalize: vi.fn(async () => false),
    };
    const { app, enqueuePromotion } = makeApp({ trust: throwing as never });
    const res = await request(app).post("/api/submissions/x/promote");
    expect(res.status).toBe(403);
    expect(enqueuePromotion).not.toHaveBeenCalled();
  });
});

describe("POST /api/submissions/:slug/promote — idempotent double-promote (AC-7)", () => {
  it("second promote of the same slug → 200 {status:'already'}, no duplicate job", async () => {
    // The enqueue seam reports the UNIQUE(slug) collision as `already`.
    const enqueuePromotion = vi
      .fn<(slug: string, requestedBy: string) => Promise<EnqueueResult>>()
      .mockResolvedValueOnce({ status: "queued" })
      .mockResolvedValueOnce({ status: "already" });
    const { app } = makeApp({ enqueuePromotion: enqueuePromotion as never });

    const first = await request(app).post("/api/submissions/dup-slug/promote");
    expect(first.status).toBe(200);
    expect(first.body.status).toBe("queued");

    const second = await request(app).post("/api/submissions/dup-slug/promote");
    expect(second.status).toBe(200);
    expect(second.body.status).toBe("already");

    // The route forwards each gated request to the seam; the seam (UNIQUE(slug))
    // is the de-dup. Both calls hit the seam exactly once each — no duplicate JOB
    // is created because the second resolves to `already`.
    expect(enqueuePromotion).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/submissions/:slug/promote — configurable threshold (AC-5)", () => {
  it("a LOWER CURATOR_THRESHOLD lets a mid-weight user through", async () => {
    const { app, enqueuePromotion } = makeApp(
      { sessionUser: vi.fn(async () => userMid) },
      cfg({ curatorThreshold: 0.3 }), // MID is 0.4 → clears 0.3
    );
    const res = await request(app).post("/api/submissions/x/promote");
    expect(res.status).toBe(200);
    expect(enqueuePromotion).toHaveBeenCalledTimes(1);
  });

  it("a HIGHER CURATOR_THRESHOLD rejects the same mid-weight user", async () => {
    const { app, enqueuePromotion } = makeApp(
      { sessionUser: vi.fn(async () => userMid) },
      cfg({ curatorThreshold: 0.7 }), // MID is 0.4 → below 0.7
    );
    const res = await request(app).post("/api/submissions/x/promote");
    expect(res.status).toBe(403);
    expect(enqueuePromotion).not.toHaveBeenCalled();
  });

  it("a weight exactly AT the threshold clears the gate (≥, not >)", async () => {
    const { app, enqueuePromotion } = makeApp(
      { sessionUser: vi.fn(async () => userMid) },
      cfg({ curatorThreshold: 0.4 }), // MID is exactly 0.4
    );
    const res = await request(app).post("/api/submissions/x/promote");
    expect(res.status).toBe(200);
    expect(enqueuePromotion).toHaveBeenCalledTimes(1);
  });
});
