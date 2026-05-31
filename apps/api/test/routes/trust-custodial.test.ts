// Failing tests (RED) for Story 26 — custodial personalization, the server-signed
// "Personalize" trigger. ADR 0026 (amended): the custodial branch of
// POST /api/trust/personalize, the follow-count gate, /status eligibility, and
// /challenge returning the server-built TEMPLATE.
//
// These exercise the NEW route deps the ADR adds to `TrustRouteDeps`
// (DI, test-hermetic): `config` (for `personalizeMinFollows`), a `followCount`
// reader, and `custodialSign` (the same dep `index.ts` builds for every other
// custodial write). All deterministic via the FixtureTrustProvider injected as
// the route `trust` dep — no Brainstorm, no relays, no `vi.mock`.
//
// RED reasons: (a) `buildTrustRouter` does not yet accept `config`/`followCount`/
// `custodialSign`; (b) the custodial branches of /status, /challenge, /personalize
// still hard-reject with `not_supported`/`canPersonalize:false` and never
// server-sign; (c) `/challenge` returns `{ challenge }`, not `{ template }`.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import { FixtureTrustProvider } from "../../src/trust";
import type { TrustProvider } from "../../src/trust";
import {
  buildTrustRouter,
  type TrustRouteDeps,
  type TrustSessionUser,
} from "../../src/routes/trust";

const OBS = "a".repeat(64); // the session user / observer (custodial)
const COOKIE = "session=" + "x".repeat(43);

const custodial: TrustSessionUser = { id: "u", pubkeyHex: OBS, tier: "custodial" };
const sovereign: TrustSessionUser = { id: "u", pubkeyHex: OBS, tier: "sovereign" };

// A signed kind-27235 the server-sign path is expected to produce from the
// provider template. The fixture provider's `personalize` ignores its contents
// (returns true + flips to scored), so any well-formed signed event is fine.
function signedChallenge(): SignedNostrEvent {
  return {
    id: "e",
    pubkey: OBS,
    sig: "s",
    kind: 27235,
    created_at: 1,
    tags: [["challenge", `fixture-challenge:${OBS}`]],
    content: "",
  } as SignedNostrEvent;
}

// Minimal config carrying just the new knob the gate reads.
function cfg(min = 10) {
  return { personalizeMinFollows: min } as unknown as TrustRouteDeps["config"];
}

function makeApp(
  over: {
    user?: TrustSessionUser | null;
    trust?: TrustProvider;
    follows?: number;
    sign?: TrustRouteDeps["custodialSign"];
    config?: TrustRouteDeps["config"];
  } = {},
) {
  const trust =
    "trust" in over ? over.trust : new FixtureTrustProvider({ weights: {} });
  const followCount =
    vi.fn(async () => ("follows" in over ? over.follows! : 10));
  const custodialSign =
    over.sign ?? vi.fn(async () => signedChallenge());
  const deps: TrustRouteDeps = {
    sessionUser: vi.fn(async () => ("user" in over ? over.user! : custodial)),
    trust,
    config: over.config ?? cfg(),
    followCount,
    custodialSign,
  } as TrustRouteDeps;
  const a = express();
  a.use(express.json());
  a.use("/", buildTrustRouter(deps));
  return { app: a, trust, followCount, custodialSign };
}

// ── AC-1: custodial trigger, happy path ──────────────────────────────────────
describe("POST /api/trust/personalize — custodial trigger (AC-1)", () => {
  it("server-signs the fixture template, calls personalize, returns { ok, building }", async () => {
    const trust = new FixtureTrustProvider({ weights: {} });
    const sign = vi.fn(async () => signedChallenge());
    const { app, custodialSign } = makeApp({ trust, follows: 10, sign });

    expect(await trust.hasScores(OBS)).toBe(false); // not scored yet

    const res = await request(app)
      .post("/api/trust/personalize")
      .set("Cookie", COOKIE)
      .send({}); // custodial posts an EMPTY body — nothing to sign client-side
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, building: true });
    expect(custodialSign).toHaveBeenCalledTimes(1);

    // The fixture observer is now scored — the same flip a real run leaves.
    expect(await trust.hasScores(OBS)).toBe(true);
  });

  it("502 challenge_failed when the provider cannot issue a template", async () => {
    // FixtureSpec.challenge:null → authChallenge returns null (no template).
    const trust = new FixtureTrustProvider({ weights: {}, challenge: null });
    const { app, custodialSign } = makeApp({ trust, follows: 10 });
    const res = await request(app)
      .post("/api/trust/personalize")
      .set("Cookie", COOKIE)
      .send({});
    expect(res.status).toBe(502);
    expect(custodialSign).not.toHaveBeenCalled();
  });

  it("502 trigger_failed when the provider declines to queue the run", async () => {
    const trust = new FixtureTrustProvider({ weights: {}, personalizeOk: false });
    const { app } = makeApp({ trust, follows: 10 });
    const res = await request(app)
      .post("/api/trust/personalize")
      .set("Cookie", COOKIE)
      .send({});
    expect(res.status).toBe(502);
  });
});

// ── AC-3: reauth-required when the ephemeral key is gone ──────────────────────
describe("POST /api/trust/personalize — custodial reauth (AC-3)", () => {
  it("401 reauth_required when the wrap is gone; personalize NOT called", async () => {
    const trust = new FixtureTrustProvider({ weights: {} });
    const personalize = vi.spyOn(trust, "personalize");
    const { app, custodialSign } = makeApp({
      trust,
      follows: 10,
      sign: vi.fn(async () => null), // wrap evicted/post-restart → fail closed
    });
    const res = await request(app)
      .post("/api/trust/personalize")
      .set("Cookie", COOKIE)
      .send({});
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
    expect(custodialSign).toHaveBeenCalledTimes(1);
    expect(personalize).not.toHaveBeenCalled(); // never queued a calc
  });
});

// ── AC-4: follow-count gate (server-enforced) ─────────────────────────────────
describe("POST /api/trust/personalize — follow gate (AC-4)", () => {
  it("403 below_follow_gate below the threshold; does not sign or personalize", async () => {
    const trust = new FixtureTrustProvider({ weights: {} });
    const personalize = vi.spyOn(trust, "personalize");
    const { app, custodialSign } = makeApp({
      trust,
      follows: 1, // below the (low) threshold
      config: cfg(2),
    });
    const res = await request(app)
      .post("/api/trust/personalize")
      .set("Cookie", COOKIE)
      .send({});
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_follow_gate");
    expect(custodialSign).not.toHaveBeenCalled();
    expect(personalize).not.toHaveBeenCalled();
  });

  it("at the threshold the trigger is allowed (200)", async () => {
    const { app } = makeApp({ follows: 2, config: cfg(2) });
    const res = await request(app)
      .post("/api/trust/personalize")
      .set("Cookie", COOKIE)
      .send({});
    expect(res.status).toBe(200);
  });
});

// ── AC-2: /status eligibility ─────────────────────────────────────────────────
describe("GET /api/trust/status — custodial eligibility (AC-2)", () => {
  it("canPersonalize:true at/above the gate", async () => {
    const { app } = makeApp({ follows: 10, config: cfg(10) });
    const res = await request(app).get("/api/trust/status").set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.canPersonalize).toBe(true);
  });

  it("canPersonalize:false below the gate", async () => {
    const { app } = makeApp({ follows: 3, config: cfg(10) });
    const res = await request(app).get("/api/trust/status").set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.canPersonalize).toBe(false);
  });

  it("hasScores reflects whether the user's calc has landed", async () => {
    const trust = new FixtureTrustProvider({ weights: {}, scoredObservers: [OBS] });
    const { app } = makeApp({ trust, follows: 10, config: cfg(10) });
    const res = await request(app).get("/api/trust/status").set("Cookie", COOKIE);
    expect(res.body.hasScores).toBe(true);
  });
});

// ── AC-2 / Decision 1: /challenge returns the TEMPLATE for eligible custodial ──
describe("GET /api/trust/challenge — custodial template (AC-2, Decision 1)", () => {
  it("returns the server-built kind-27235 TEMPLATE (not a bare string) at/above the gate", async () => {
    const { app } = makeApp({ follows: 10, config: cfg(10) });
    const res = await request(app).get("/api/trust/challenge").set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.template).toMatchObject({ kind: 27235, content: "" });
    expect(res.body.template.tags).toContainEqual(["challenge", `fixture-challenge:${OBS}`]);
    // The fixture template carries NO brainstorm_login (that literal lives only
    // in the Brainstorm adapter after this story).
    expect(JSON.stringify(res.body.template)).not.toContain("brainstorm_login");
  });

  it("403 below_follow_gate below the threshold (the not_supported reject is relaxed)", async () => {
    const { app } = makeApp({ follows: 1, config: cfg(10) });
    const res = await request(app).get("/api/trust/challenge").set("Cookie", COOKIE);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_follow_gate");
  });
});

// ── AC-6: sovereign path unchanged (server NEVER server-signs for sovereign) ──
describe("POST /api/trust/personalize — sovereign unchanged (AC-6)", () => {
  it("posts the client-signed { event }; server does not call custodialSign", async () => {
    const trust = new FixtureTrustProvider({ weights: {} });
    const personalize = vi.spyOn(trust, "personalize");
    const ev = { pubkey: OBS, kind: 27235 } as unknown as SignedNostrEvent;
    const { app, custodialSign } = makeApp({ user: sovereign, trust });
    const res = await request(app)
      .post("/api/trust/personalize")
      .set("Cookie", COOKIE)
      .send({ event: ev });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, building: true });
    expect(personalize).toHaveBeenCalledWith(OBS, ev);
    expect(custodialSign).not.toHaveBeenCalled(); // server never signs for sovereign
  });

  it("400 when the sovereign event pubkey is not the session user (unchanged)", async () => {
    const { app } = makeApp({ user: sovereign });
    const res = await request(app)
      .post("/api/trust/personalize")
      .set("Cookie", COOKIE)
      .send({ event: { pubkey: "b".repeat(64) } });
    expect(res.status).toBe(400);
  });
});

// ── AC-8: fixture-verifiable end to end (status → trigger → status) ───────────
describe("custodial path end-to-end against the fixture (AC-8)", () => {
  it("status(eligible, no scores) → personalize → status(hasScores)", async () => {
    const trust = new FixtureTrustProvider({ weights: {} });
    const followCount = vi.fn(async () => 10);
    const deps = {
      sessionUser: vi.fn(async () => custodial),
      trust,
      config: cfg(10),
      followCount,
      custodialSign: vi.fn(async () => signedChallenge()),
    } as unknown as TrustRouteDeps;
    const a = express();
    a.use(express.json());
    a.use("/", buildTrustRouter(deps));

    const before = await request(a).get("/api/trust/status").set("Cookie", COOKIE);
    expect(before.body).toMatchObject({ canPersonalize: true, hasScores: false });

    const trig = await request(a).post("/api/trust/personalize").set("Cookie", COOKIE).send({});
    expect(trig.status).toBe(200);

    const after = await request(a).get("/api/trust/status").set("Cookie", COOKIE);
    expect(after.body.hasScores).toBe(true);
  });
});
