// Failing tests (red) for Story 31 / ADR 0032 §1 — the claim WRITE route. A new
// DI'd `buildClaimsRouter(userEventDeps)` mirrors buildRatingsRouter: the same
// template→sign→submit (sovereign) and template→custodialSign→publish (custodial)
// two-tier path, no new crypto. Claiming is OPEN (CLAUDE.md invariant 2): the
// write is gated on a session ONLY, never on trust/role/verification.
//
// Trust-INDEPENDENT: no trust provider, no Brainstorm, no relay, no human. DI'd
// query/publish/sessionUser/custodialSign; signed-event fixtures via an audited
// keypair. No intra-module vi.mock; no Date.now in asserted output.
//
// Red until apps/api/src/routes/claims.ts (buildClaimsRouter + ClaimsDeps),
// apps/api/src/claims/template.ts (buildClaimTemplate) and
// apps/api/src/claims/validate.ts (validateSignedClaim) exist.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import type { Config } from "../../src/config";
import {
  buildClaimsRouter,
  type ClaimsDeps,
  type ClaimsSessionUser,
} from "../../src/routes/claims";
import { LIBRARIAN, signedClaim } from "../claims/_fixtures";

const cfg: Config = {
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "x",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "http://localhost:7700",
  searchApiKey: "x",
  searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "postgres://x:x@localhost:5432/x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
  librarianPubkey: LIBRARIAN,
};

const COOKIE = "session=" + "x".repeat(43);

const sovereign: ClaimsSessionUser = {
  id: "u1",
  pubkeyHex: "9".repeat(64),
  tier: "sovereign",
};

function custodialUser(pubkeyHex: string): ClaimsSessionUser {
  return { id: "u-cust", pubkeyHex, tier: "custodial" };
}

function makeApp(overrides: Partial<ClaimsDeps> = {}) {
  const deps: ClaimsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt-id" })),
    query: vi.fn(async () => []),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildClaimsRouter(deps));
  return { app, deps };
}

// ── AC-1 / AC-8: template endpoint, signed-out rejection ──

describe("POST /api/claims/template", () => {
  it("returns an unsigned kind-39999 claim template for a signed-in user", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/claims/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(39999);
    // The template targets the canonical book address and z-tags the claims header.
    expect(res.body.template.tags).toContainEqual(["a", `39999:${LIBRARIAN}:orbital`]);
    expect(res.body.template.tags).toContainEqual(["z", `39998:${LIBRARIAN}:book-claims`]);
  });

  it("401 no_session when the visitor is signed out (server-side rejection)", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/claims/template")
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("no_session");
  });
});

// ── AC-1 / AC-8 sovereign write path ──

describe("POST /api/claims — sovereign (client-signed)", () => {
  it("publishes a valid signed claim and returns the refreshed claimant list", async () => {
    const { event, pubkey } = signedClaim({ bookSlug: "orbital" });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: pubkey })),
      query: vi.fn(async () => [event] as never),
    });
    const res = await request(app)
      .post("/api/claims")
      .set("Cookie", COOKIE)
      .send({ event });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.claimed).toBe(true);
    // The read-back surfaces the claimant by npub (never hex on the wire).
    expect(res.body.claimants).toEqual([{ npub: npubEncode(pubkey) }]);
  });

  it("403 pubkey_mismatch when the event pubkey is not the session user", async () => {
    const { event } = signedClaim(); // a different keypair than 9*64
    const { app } = makeApp(); // session is sovereign (9*64)
    const res = await request(app)
      .post("/api/claims")
      .set("Cookie", COOKIE)
      .send({ event });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("pubkey_mismatch");
  });

  it("401 no_session for a signed-out claim POST (server-side rejection)", async () => {
    const { event } = signedClaim();
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/claims").send({ event });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("no_session");
  });

  it("502 publish_failed when the relay rejects the claim", async () => {
    const { event, pubkey } = signedClaim();
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: pubkey })),
      publish: vi.fn(async () => ({ ok: false as const, reason: "relay down" })),
    });
    const res = await request(app)
      .post("/api/claims")
      .set("Cookie", COOKIE)
      .send({ event });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("publish_failed");
  });

  it("is idempotent: re-claiming the same book yields one claim (stable d-tag)", async () => {
    // Two claims by the same keypair on the same book replace under the same
    // per-(claimant, book) d-tag; the read-back dedupes to a single claimant.
    const first = signedClaim({ bookSlug: "orbital", createdAt: 1 });
    const second = signedClaim({
      sk: first.sk,
      bookSlug: "orbital",
      createdAt: 9,
    });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: first.pubkey })),
      // The relay returns both events (same d-tag); the route must collapse them.
      query: vi.fn(async () => [first.event, second.event] as never),
    });
    const res = await request(app)
      .post("/api/claims")
      .set("Cookie", COOKIE)
      .send({ event: second.event });
    expect(res.status).toBe(200);
    expect(res.body.claimants).toEqual([{ npub: npubEncode(first.pubkey) }]);
  });
});

// ── AC-8 custodial write path (server ephemeral-wrap, ADR 0006) ──

describe("POST /api/claims — custodial (server-signed)", () => {
  it("server-signs the claim and publishes it (no client event in the body)", async () => {
    const { event, pubkey } = signedClaim({ bookSlug: "orbital" });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodialUser(pubkey)),
      custodialSign: vi.fn(async () => event as never),
      query: vi.fn(async () => [event] as never),
    });
    const res = await request(app)
      .post("/api/claims")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(200);
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.claimed).toBe(true);
  });

  it("401 reauth_required when the session has no live signing key", async () => {
    const { app } = makeApp({
      sessionUser: vi.fn(async () => custodialUser("9".repeat(64))),
      custodialSign: vi.fn(async () => null), // wrap gone (post-restart)
    });
    const res = await request(app)
      .post("/api/claims")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
  });

  it("502 publish_failed when the relay rejects the server-signed claim", async () => {
    const { event, pubkey } = signedClaim();
    const { app } = makeApp({
      sessionUser: vi.fn(async () => custodialUser(pubkey)),
      custodialSign: vi.fn(async () => event as never),
      publish: vi.fn(async () => ({ ok: false as const, reason: "relay down" })),
    });
    const res = await request(app)
      .post("/api/claims")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital" });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("publish_failed");
  });
});
