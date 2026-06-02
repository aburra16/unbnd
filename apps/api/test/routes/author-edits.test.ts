// Failing tests (red) for Story 32 / ADR 0033 §4 — the `author-edits` VERIFIED-
// author-gated write route. A new DI'd `buildAuthorEditsRouter(deps)` clones the
// claims.ts two-tier path (sovereign template→sign→submit; custodial
// template→custodialSign→publish, no new crypto) WITH a verified-author gate: the
// session user must be the Verified author of THIS book (recompute
// computeVerification for (session, book) → must clear N). Server-enforced on both
// the template and the write:
//   anon → 401 no_session; not verified (bare claimant / non-claimant / signed-out)
//     → 403 not_verified; verified author → publish;
//   coverUrl / purchaseUrl must be well-formed http(s) (Story 22 parity) → bad →
//     400 invalid_url, NO publish; an event carrying a non-whitelisted editable
//     field (e.g. title) → 400 invalid_event, NO publish; per-author replaceable;
//   custodial → custodialSign (null → 401 reauth_required, publish fail → 502).
//
// All DI-driven: inject the FIXTURE TrustProvider (deterministic), a fake session,
// and a routed `query` that returns the verification assertions clearing N. No
// Brainstorm, no relay, no human. No intra-module vi.mock; no Date.now asserted.
//
// Red until apps/api/src/routes/author-edits.ts (buildAuthorEditsRouter +
// AuthorEditsDeps), apps/api/src/author-edits/template.ts and
// apps/api/src/author-edits/validate.ts exist.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import {
  buildAuthorEditsRouter,
  type AuthorEditsDeps,
  type AuthorEditsSessionUser,
} from "../../src/routes/author-edits";
import {
  LIBRARIAN,
  signedAuthorOverlay,
  signedAuthorVerified,
} from "../author-verified/_fixtures";

const HOUSE = "b".repeat(64);
const CUR1 = "c".repeat(64);
const CUR2 = "d".repeat(64);
const COOKIE = "session=" + "x".repeat(43);

function cfg(over: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIBRARIAN,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    verifiedAuthorMinCurators: 2,
    ...over,
  } as unknown as Config;
}

// HOUSE trusts CUR1/CUR2 above the floor (so two curators clear N=2 for AUTHOR).
function fixtureTrust() {
  return new FixtureTrustProvider({ weights: { [HOUSE]: { [CUR1]: 0.9, [CUR2]: 0.8 } } });
}

function sovereign(pubkeyHex: string): AuthorEditsSessionUser {
  return { id: "u-sov", pubkeyHex, tier: "sovereign" };
}
function custodial(pubkeyHex: string): AuthorEditsSessionUser {
  return { id: "u-cust", pubkeyHex, tier: "custodial" };
}

// A routed query whose verification read (#z author-verified) returns two curator
// assertions that verify `authorHex`. To make the verification deterministic, the
// two assertions carry the trusted curator hexes (CUR1/CUR2) as their signer
// pubkey, so the count-gate's weight lookup clears the floor (the read path counts
// the asserter's house weight; it does not verify the signature here).
function verifiedQueryFor(authorHex: string): AuthorEditsDeps["query"] {
  const mk = (curatorHex: string, created: number): SignedNostrEvent => {
    const a = signedAuthorVerified({ authorPubkey: authorHex, createdAt: created });
    // Overwrite the signer pubkey to the trusted curator hex (read path doesn't
    // verify the signature; the gate counts the asserter's house weight).
    return { ...a.event, pubkey: curatorHex } as unknown as SignedNostrEvent;
  };
  const assertions = [mk(CUR1, 10), mk(CUR2, 11)];
  return vi.fn(async (filter: Record<string, unknown>): Promise<SignedNostrEvent[]> => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("author-verified")) return assertions;
    return [];
  });
}

function makeApp(over: Partial<AuthorEditsDeps> = {}, config: Config = cfg()) {
  const deps = {
    config,
    sessionUser: vi.fn(async () => sovereign("a".repeat(64))),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt" })),
    query: vi.fn(async () => []),
    trust: fixtureTrust(),
    ...over,
  } as unknown as AuthorEditsDeps;
  const app = express();
  app.use(express.json());
  app.use("/", buildAuthorEditsRouter(deps));
  return { app, deps };
}

// ── AC-5: verified-author gate, server-enforced ──

describe("POST /api/author-edits/template — verified-author gate (AC-5)", () => {
  it("a Verified author → an unsigned author-edits template prefilled with the three fields", async () => {
    const author = signedAuthorOverlay({}).authorPubkey;
    const { app } = makeApp({
      sessionUser: vi.fn(async () => sovereign(author)),
      query: verifiedQueryFor(author),
    });
    const res = await request(app)
      .post("/api/author-edits/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", blurb: "Mine", coverUrl: "https://x.test/c.jpg" });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(39999);
    expect(res.body.template.tags).toContainEqual(["z", `39998:${LIBRARIAN}:author-edits`]);
    expect(res.body.template.tags).toContainEqual(["a", `39999:${LIBRARIAN}:orbital`]);
  });

  it("a NON-verified user (bare claimant / non-claimant) → 403 not_verified", async () => {
    const bare = "9".repeat(64);
    const { app } = makeApp({
      sessionUser: vi.fn(async () => sovereign(bare)),
      // No verification assertions clear N for `bare`.
      query: vi.fn(async () => []),
    });
    const res = await request(app)
      .post("/api/author-edits/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", blurb: "Mine" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("not_verified");
  });

  it("signed-out → 401 no_session", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/author-edits/template")
      .send({ bookSlug: "orbital", blurb: "Mine" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("no_session");
  });
});

// ── AC-5: URL validation, no publish on a bad value ──

describe("POST /api/author-edits/template — http(s) URL validation (AC-5)", () => {
  it("a non-http(s) coverUrl → 400 invalid_url, no template", async () => {
    const author = signedAuthorOverlay({}).authorPubkey;
    const { app } = makeApp({
      sessionUser: vi.fn(async () => sovereign(author)),
      query: verifiedQueryFor(author),
    });
    const res = await request(app)
      .post("/api/author-edits/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", coverUrl: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_url");
  });

  it("a non-http(s) purchaseUrl → 400 invalid_url", async () => {
    const author = signedAuthorOverlay({}).authorPubkey;
    const { app } = makeApp({
      sessionUser: vi.fn(async () => sovereign(author)),
      query: verifiedQueryFor(author),
    });
    const res = await request(app)
      .post("/api/author-edits/template")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", purchaseUrl: "ftp://nope" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_url");
  });
});

// ── AC-5: sovereign write path ──

describe("POST /api/author-edits — sovereign verified author (AC-5)", () => {
  it("publishes a valid author overlay once + returns the effectiveBook read-back", async () => {
    const overlay = signedAuthorOverlay({ blurb: "Mine", coverUrl: "https://x.test/c.jpg" });
    const author = overlay.authorPubkey;
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => sovereign(author)),
      query: verifiedQueryFor(author),
    });
    const res = await request(app)
      .post("/api/author-edits")
      .set("Cookie", COOKIE)
      .send({ event: overlay.event });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.ok).toBe(true);
  });

  it("a non-verified author POST → 403 not_verified, no publish", async () => {
    const overlay = signedAuthorOverlay({ blurb: "Mine" });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => sovereign(overlay.authorPubkey)),
      query: vi.fn(async () => []), // nothing verifies them
    });
    const res = await request(app)
      .post("/api/author-edits")
      .set("Cookie", COOKIE)
      .send({ event: overlay.event });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("not_verified");
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("403 pubkey_mismatch when the overlay pubkey is not the session user", async () => {
    const overlay = signedAuthorOverlay({ blurb: "Mine" }); // a fresh keypair
    const other = "7".repeat(64);
    const { app } = makeApp({
      sessionUser: vi.fn(async () => sovereign(other)),
      query: verifiedQueryFor(other), // `other` is verified, but didn't sign this
    });
    const res = await request(app)
      .post("/api/author-edits")
      .set("Cookie", COOKIE)
      .send({ event: overlay.event });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("pubkey_mismatch");
  });

  it("an event carrying a non-whitelisted editable field (e.g. title) → 400 invalid_event, no publish", async () => {
    const overlay = signedAuthorOverlay({ blurb: "Mine" });
    const author = overlay.authorPubkey;
    // Smuggle a `title` into the overlay payload's json tag (the whitelist must reject it).
    const tampered = {
      ...overlay.event,
      tags: overlay.event.tags.map((t) =>
        t[0] === "json"
          ? ["json", JSON.stringify({ ...JSON.parse(t[1]!), bookAuthorOverlay: { ...JSON.parse(t[1]!).bookAuthorOverlay, title: "Hijacked" } })]
          : t,
      ),
    };
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => sovereign(author)),
      query: verifiedQueryFor(author),
    });
    const res = await request(app)
      .post("/api/author-edits")
      .set("Cookie", COOKIE)
      .send({ event: tampered });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_event");
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("502 publish_failed when the relay rejects the overlay", async () => {
    const overlay = signedAuthorOverlay({ blurb: "Mine" });
    const author = overlay.authorPubkey;
    const { app } = makeApp({
      sessionUser: vi.fn(async () => sovereign(author)),
      query: verifiedQueryFor(author),
      publish: vi.fn(async () => ({ ok: false as const, reason: "down" })),
    });
    const res = await request(app)
      .post("/api/author-edits")
      .set("Cookie", COOKIE)
      .send({ event: overlay.event });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("publish_failed");
  });
});

// ── AC-9: custodial tier ──

describe("POST /api/author-edits — custodial verified author (AC-9)", () => {
  it("server-signs and publishes (no client event in the body)", async () => {
    const overlay = signedAuthorOverlay({ blurb: "Mine" });
    const author = overlay.authorPubkey;
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(author)),
      custodialSign: vi.fn(async () => overlay.event as never),
      query: verifiedQueryFor(author),
    });
    const res = await request(app)
      .post("/api/author-edits")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", blurb: "Mine" });
    expect(res.status).toBe(200);
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });

  it("401 reauth_required when the custodial session has no live signing key", async () => {
    const author = "a".repeat(64);
    const { app } = makeApp({
      sessionUser: vi.fn(async () => custodial(author)),
      custodialSign: vi.fn(async () => null),
      query: verifiedQueryFor(author),
    });
    const res = await request(app)
      .post("/api/author-edits")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", blurb: "Mine" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
  });

  it("a non-verified custodial author is rejected 403 before signing", async () => {
    const custodialSign = vi.fn(async () => null);
    const { app } = makeApp({
      sessionUser: vi.fn(async () => custodial("9".repeat(64))),
      custodialSign,
      query: vi.fn(async () => []),
    });
    const res = await request(app)
      .post("/api/author-edits")
      .set("Cookie", COOKIE)
      .send({ bookSlug: "orbital", blurb: "Mine" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("not_verified");
    expect(custodialSign).not.toHaveBeenCalled();
  });
});
