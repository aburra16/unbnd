// Failing tests (red) for Story 32 / ADR 0033 §1 — the `author-verified` CURATOR-
// GATED write route. A new DI'd `buildAuthorVerifiedRouter(deps)` clones the
// claims.ts two-tier path (sovereign template→sign→submit; custodial
// template→custodialSign→publish, no new crypto) WITH the Story-30 curator gate
// added: only a session user whose own house-PoV weight ≥ CURATOR_THRESHOLD may
// assert/dispute. The gate is server-enforced on BOTH the template and the write:
//   anon → 401 no_session; below floor / absent-from-map → 403 below_gate;
//   above + sovereign valid → publish once; pubkey ≠ session → 403 pubkey_mismatch;
//   custodial → custodialSign (null → 401 reauth_required, publish fail → 502);
//   re-assert same (curator, author, book) → idempotent (stable d-tag). Both tiers.
//
// All DI-driven: inject the FIXTURE TrustProvider (deterministic), a fake session,
// signed-event fixtures via an audited keypair. No Brainstorm, no relay, no human.
// No intra-module vi.mock; no Date.now in asserted output.
//
// Red until apps/api/src/routes/author-verified.ts (buildAuthorVerifiedRouter +
// AuthorVerifiedDeps), apps/api/src/author-verified/template.ts and
// apps/api/src/author-verified/validate.ts exist.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import {
  buildAuthorVerifiedRouter,
  type AuthorVerifiedDeps,
  type AuthorVerifiedSessionUser,
} from "../../src/routes/author-verified";
import { LIBRARIAN, signedAuthorVerified } from "../author-verified/_fixtures";

const HOUSE = "b".repeat(64);
const ABOVE = "c".repeat(64); // weight 0.9 ≥ 0.5
const BELOW = "e".repeat(64); // absent from the map → weight 0
const AUTHOR = "a".repeat(64); // the claimant being verified

function cfg(over: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIBRARIAN,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    ...over,
  } as unknown as Config;
}

function fixtureTrust() {
  return new FixtureTrustProvider({ weights: { [HOUSE]: { [ABOVE]: 0.9 } } });
}

const COOKIE = "session=" + "x".repeat(43);

function curatorAbove(pubkeyHex = ABOVE): AuthorVerifiedSessionUser {
  return { id: "u-above", pubkeyHex, tier: "sovereign" };
}
function custodial(pubkeyHex: string): AuthorVerifiedSessionUser {
  return { id: "u-cust", pubkeyHex, tier: "custodial" };
}

function makeApp(over: Partial<AuthorVerifiedDeps> = {}, config: Config = cfg()) {
  const deps = {
    config,
    sessionUser: vi.fn(async () => curatorAbove()),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt" })),
    query: vi.fn(async () => []),
    trust: fixtureTrust(),
    ...over,
  } as unknown as AuthorVerifiedDeps;
  const app = express();
  app.use(express.json());
  app.use("/", buildAuthorVerifiedRouter(deps));
  return { app, deps };
}

// ── AC-1: the curator gate, server-enforced on the TEMPLATE ──

describe("POST /api/author-verified/template — curator gate (AC-1)", () => {
  it("above-threshold curator → an unsigned author-verified template (#a book, #p author)", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/author-verified/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", authorPubkey: AUTHOR, polarity: 1 });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(39999);
    expect(res.body.template.tags).toContainEqual(["a", `39999:${LIBRARIAN}:orbital`]);
    expect(res.body.template.tags).toContainEqual(["z", `39998:${LIBRARIAN}:author-verified`]);
    expect(res.body.template.tags).toContainEqual(["p", AUTHOR]);
    expect(res.body.template.tags).toContainEqual(["polarity", "1"]);
  });

  it("anon (signed out) → 401 no_session", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/author-verified/template")
      .send({ bookSlug: "orbital", authorPubkey: AUTHOR, polarity: 1 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("no_session");
  });

  it("below-floor curator → 403 below_gate (server-enforced, not UI-hidden)", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => curatorAbove(BELOW)) });
    const res = await request(app)
      .post("/api/author-verified/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", authorPubkey: AUTHOR, polarity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
  });
});

// ── AC-1: the curator gate, server-enforced on the WRITE (sovereign) ──

describe("POST /api/author-verified — sovereign curator (AC-1)", () => {
  it("above-floor curator with a valid signed assertion → publishes once + {ok}", async () => {
    const { event, curatorPubkey } = signedAuthorVerified({ authorPubkey: AUTHOR });
    const { app, deps } = makeApp(
      { sessionUser: vi.fn(async () => curatorAbove(curatorPubkey)) },
      cfg({ houseObserverPubkey: HOUSE }),
    );
    // The signer must be above the floor — give them weight from the house.
    (deps as { trust: FixtureTrustProvider }).trust = new FixtureTrustProvider({
      weights: { [HOUSE]: { [curatorPubkey]: 0.9 } },
    });
    const res = await request(app)
      .post("/api/author-verified")
      .set("Cookie", COOKIE)
      .send({ event });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.ok).toBe(true);
  });

  it("anon → 401 no_session (server-side rejection)", async () => {
    const { event } = signedAuthorVerified({ authorPubkey: AUTHOR });
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/author-verified").send({ event });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("no_session");
  });

  it("below-floor session → 403 below_gate (re-checked server-side on the write)", async () => {
    const { event, curatorPubkey } = signedAuthorVerified({ authorPubkey: AUTHOR });
    // Session is BELOW (absent from the house weight map) regardless of who signed.
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => curatorAbove(BELOW)),
    });
    // Make the body's event pubkey match the session so the gate is what rejects.
    void curatorPubkey;
    void deps;
    const res = await request(app)
      .post("/api/author-verified")
      .set("Cookie", COOKIE)
      .send({ event });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
  });

  it("403 pubkey_mismatch when the event pubkey is not the session curator", async () => {
    const { event } = signedAuthorVerified({ authorPubkey: AUTHOR }); // a fresh keypair
    // Session is ABOVE the gate but a DIFFERENT key than the one that signed.
    const { app } = makeApp({ sessionUser: vi.fn(async () => curatorAbove(ABOVE)) });
    const res = await request(app)
      .post("/api/author-verified")
      .set("Cookie", COOKIE)
      .send({ event });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("pubkey_mismatch");
  });

  it("502 publish_failed when the relay rejects the assertion", async () => {
    const { event, curatorPubkey } = signedAuthorVerified({ authorPubkey: AUTHOR });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => curatorAbove(curatorPubkey)),
      publish: vi.fn(async () => ({ ok: false as const, reason: "down" })),
      trust: new FixtureTrustProvider({ weights: { [HOUSE]: { [curatorPubkey]: 0.9 } } }),
    });
    const res = await request(app)
      .post("/api/author-verified")
      .set("Cookie", COOKIE)
      .send({ event });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("publish_failed");
  });
});

// ── AC-1: gate honest-degrade closes the gate (AC-8) ──

describe("POST /api/author-verified — honest degrade closes the gate (AC-8)", () => {
  it("no trust provider → weight 0 → gate CLOSES (403 below_gate)", async () => {
    const { app } = makeApp({ trust: undefined });
    const res = await request(app)
      .post("/api/author-verified/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", authorPubkey: AUTHOR, polarity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
  });

  it("a throwing trust seam still closes the gate without a 500", async () => {
    const throwing = {
      name: "fixture" as const,
      weights: vi.fn(async () => {
        throw new Error("down");
      }),
      hasScores: vi.fn(async () => false),
      authChallenge: vi.fn(async () => null),
      personalize: vi.fn(async () => false),
    };
    const { app } = makeApp({ trust: throwing as never });
    const res = await request(app)
      .post("/api/author-verified/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", authorPubkey: AUTHOR, polarity: 1 });
    expect(res.status).toBe(403);
  });
});

// ── AC-9: custodial tier (server ephemeral-wrap, ADR 0006) ──

describe("POST /api/author-verified — custodial curator (AC-9)", () => {
  it("server-signs and publishes (no client event in the body)", async () => {
    const { event, curatorPubkey } = signedAuthorVerified({ authorPubkey: AUTHOR });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(curatorPubkey)),
      custodialSign: vi.fn(async () => event as never),
      trust: new FixtureTrustProvider({ weights: { [HOUSE]: { [curatorPubkey]: 0.9 } } }),
    });
    const res = await request(app)
      .post("/api/author-verified")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", authorPubkey: AUTHOR, polarity: 1 });
    expect(res.status).toBe(200);
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.ok).toBe(true);
  });

  it("401 reauth_required when the custodial session has no live signing key", async () => {
    const above = custodial(ABOVE);
    const { app } = makeApp({
      sessionUser: vi.fn(async () => above),
      custodialSign: vi.fn(async () => null),
    });
    const res = await request(app)
      .post("/api/author-verified")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", authorPubkey: AUTHOR, polarity: 1 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
  });

  it("a below-floor custodial curator is rejected 403 before signing", async () => {
    const custodialSign = vi.fn(async () => null);
    const { app } = makeApp({
      sessionUser: vi.fn(async () => custodial(BELOW)),
      custodialSign,
    });
    const res = await request(app)
      .post("/api/author-verified")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", authorPubkey: AUTHOR, polarity: 1 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("below_gate");
    expect(custodialSign).not.toHaveBeenCalled();
  });
});

// ── AC-1: idempotent per-(curator, author, book) d-tag ──

describe("POST /api/author-verified — idempotent (AC-1)", () => {
  it("re-asserting the same (curator, author, book) reuses a stable d-tag", async () => {
    const sk = signedAuthorVerified({ authorPubkey: AUTHOR }).sk;
    const first = signedAuthorVerified({ sk, authorPubkey: AUTHOR, createdAt: 1 });
    const second = signedAuthorVerified({ sk, authorPubkey: AUTHOR, createdAt: 9 });
    const dOf = (e: { tags: string[][] }) => e.tags.find((t) => t[0] === "d")?.[1];
    expect(dOf(first.event)).toBe(dOf(second.event));
  });
});
