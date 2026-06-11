// FAILING TESTS — Story 80 / ADR 0078 (the demote endpoint).
//
// POST /api/submissions/:slug/demote mirrors the promote gate exactly (the
// same house-vantage curator threshold, server-enforced, fail-closed), then
// calls the gated `enqueueDemotion`: `queued` (200), `already` (200, the
// idempotent no-op — AC-6), `not_promoted` (400 — never promoted / seeded /
// in flight; seeded books have no promotions row so they are structurally
// undemotable).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { asHexPubkey } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import {
  buildSubmissionsRouter,
  type SubmissionsDeps,
  type SubmissionsSessionUser,
} from "../../src/routes/submissions";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "b".repeat(64);
const ABOVE = "c".repeat(64);
const BELOW = "e".repeat(64);

function cfg(over: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    ...over,
  } as unknown as Config;
}

function fixtureTrust() {
  return new FixtureTrustProvider({ weights: { [HOUSE]: { [ABOVE]: 0.9 } } });
}

const userAbove: SubmissionsSessionUser = { id: "u1", pubkeyHex: ABOVE, tier: "sovereign" };
const userBelow: SubmissionsSessionUser = { id: "u3", pubkeyHex: BELOW, tier: "sovereign" };

type DemoteResult = { status: "queued" | "already" | "not_promoted" };

function makeApp(over: Partial<SubmissionsDeps> = {}, config: Config = cfg()) {
  const enqueueDemotion = vi.fn(
    async (_slug: string, _requestedBy: string): Promise<DemoteResult> => ({ status: "queued" }),
  );
  const deps = {
    config,
    sessionUser: vi.fn(async () => userAbove),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => [] as SignedNostrEvent[]),
    custodialSign: vi.fn(async () => null),
    trust: fixtureTrust(),
    enqueueDemotion,
    ...over,
  } as unknown as SubmissionsDeps & { enqueueDemotion: typeof enqueueDemotion };
  const app = express();
  app.use(express.json());
  app.use("/", buildSubmissionsRouter(deps as SubmissionsDeps));
  return { app, enqueueDemotion };
}

describe("POST /api/submissions/:slug/demote — the curator gate (AC-1)", () => {
  it("above-threshold curator → enqueues once with the curator as requestedBy + 200 queued", async () => {
    const { app, enqueueDemotion } = makeApp();
    const res = await request(app).post("/api/submissions/orbital--x/demote");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("queued");
    expect(enqueueDemotion).toHaveBeenCalledTimes(1);
    expect(enqueueDemotion).toHaveBeenCalledWith("orbital--x", ABOVE);
  });

  it("anon → 401, no enqueue", async () => {
    const { app, enqueueDemotion } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/submissions/orbital--x/demote");
    expect(res.status).toBe(401);
    expect(enqueueDemotion).not.toHaveBeenCalled();
  });

  it("below-threshold → 403 below_gate, server-enforced, no enqueue", async () => {
    const { app, enqueueDemotion } = makeApp({ sessionUser: vi.fn(async () => userBelow) });
    const res = await request(app).post("/api/submissions/orbital--x/demote");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
    expect(enqueueDemotion).not.toHaveBeenCalled();
  });

  it("honest degrade closes the gate: no trust provider → 403, no enqueue", async () => {
    const { app, enqueueDemotion } = makeApp({ trust: undefined });
    const res = await request(app).post("/api/submissions/orbital--x/demote");
    expect(res.status).toBe(403);
    expect(enqueueDemotion).not.toHaveBeenCalled();
  });
});

describe("POST /api/submissions/:slug/demote — the state machine answers (AC-6)", () => {
  it("not a demotable promoted book (never promoted / seeded / in flight) → 400 not_promoted", async () => {
    const { app } = makeApp({
      enqueueDemotion: vi.fn(async () => ({ status: "not_promoted" as const })),
    });
    const res = await request(app).post("/api/submissions/seeded--y/demote");
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("not_promoted");
  });

  it("already demoted or already queued → 200 already (idempotent no-op, not an error)", async () => {
    const { app } = makeApp({
      enqueueDemotion: vi.fn(async () => ({ status: "already" as const })),
    });
    const res = await request(app).post("/api/submissions/orbital--x/demote");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("already");
  });

  it("no enqueueDemotion dep wired → 501", async () => {
    const { app } = makeApp({ enqueueDemotion: undefined });
    const res = await request(app).post("/api/submissions/orbital--x/demote");
    expect(res.status).toBe(501);
  });
});
