// Failing tests (red) for Story 23 — the three-tier kind-3 follow endpoints +
// the session-gated follow-status read. ADR 0023 Decision 2 / Decision 3, new
// file `apps/api/src/routes/profile-follow.ts`:
//   `buildProfileFollowRouter({ config, sessionUser, publish, fetchRaw,
//   custodialSign })` mirrors `buildProfileSubstackRouter`. Routes:
//     POST /api/profile/follow/template — session-gated (401); resolve target
//       via toHex (400 invalid_target); self-follow → 400 self_follow; fetchRaw
//       → mergeFollow → buildKind3Template; return { template } (kind 3, merged
//       tags, created_at bumped past the fetched event). Sovereign signs this.
//     POST /api/profile/follow — tier-branched submit:
//       custodial: { target, action } → fetchRaw + merge + custodialSign →
//         publish; custodialSign null → 401 reauth_required; self-follow → 400.
//       sovereign: { event, target, action } → validateSignedKind3 → publish;
//         pubkey mismatch → 403; self-follow (hinted) → 400.
//       anonymous → 401; publish failure → 502; 200 { following: action ===
//       "follow" } (optimistic echo).
//     GET /api/profile/follows/:target — session-gated (401 anon); toHex (404
//       not_found); self → { following: false }; else read the VIEWER's kind-3,
//       { following: <a p tag with tag[1] === targetHex exists> }.
//
// The router does not exist yet → import fails → red.
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Config } from "../../src/config";
import {
  buildProfileFollowRouter,
  type ProfileFollowDeps,
  type SessionUser,
} from "../../src/routes/profile-follow";

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
  profileRelays: ["wss://relay.damus.io", "wss://relay.primal.net"],
} as Config;

const COOKIE = "session=" + "x".repeat(43);
const SELF = "9".repeat(64);
const TARGET = "a".repeat(64);

function sovereign(pubkeyHex: string): SessionUser {
  return { id: "u-sov", pubkeyHex, tier: "sovereign" };
}
function custodial(pubkeyHex: string): SessionUser {
  return { id: "u-cust", pubkeyHex, tier: "custodial" };
}

/** A wire-realistic signed kind-3 for a fresh keypair. */
function signedKind3(tags: string[][], content = "", sk = generateSecretKey()) {
  const pubkey = getPublicKey(sk);
  const signed = finalizeEvent(
    { kind: 3, created_at: Math.floor(Date.now() / 1000), tags, content },
    sk,
  );
  return { sk, pubkey, event: JSON.parse(JSON.stringify(signed)) as typeof signed };
}

function makeApp(overrides: Partial<ProfileFollowDeps> = {}) {
  const deps: ProfileFollowDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign(SELF)),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt-id" })),
    fetchRaw: vi.fn(async () => ({ tags: null, content: "", createdAt: null })),
    custodialSign: vi.fn(async () => null),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildProfileFollowRouter(deps));
  return { app, deps };
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/profile/follow/template (AC-3/AC-4)", () => {
  it("returns a kind-3 follow template that appends the target p-tag, preserving existing follows", async () => {
    const { app } = makeApp({
      fetchRaw: vi.fn(async () => ({
        tags: [["p", "b".repeat(64), "wss://r", "bob"]],
        content: "",
        createdAt: 100,
      })),
    });
    const res = await request(app)
      .post("/api/profile/follow/template")
      .set("Cookie", COOKIE)
      .send({ target: TARGET, action: "follow" });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(3);
    expect(res.body.template.tags).toContainEqual(["p", TARGET]);
    // Merge-don't-clobber: the pre-existing follow survives into the template.
    expect(res.body.template.tags).toContainEqual([
      "p",
      "b".repeat(64),
      "wss://r",
      "bob",
    ]);
  });

  it("returns a kind-3 UNFOLLOW template that removes only the target p-tag", async () => {
    const { app } = makeApp({
      fetchRaw: vi.fn(async () => ({
        tags: [["p", TARGET], ["p", "b".repeat(64)]],
        content: "",
        createdAt: 100,
      })),
    });
    const res = await request(app)
      .post("/api/profile/follow/template")
      .set("Cookie", COOKIE)
      .send({ target: TARGET, action: "unfollow" });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(3);
    expect(res.body.template.tags).not.toContainEqual(["p", TARGET]);
    expect(res.body.template.tags).toContainEqual(["p", "b".repeat(64)]);
  });

  it("bumps created_at strictly past the fetched event so replacement wins (AC-8)", async () => {
    const future = Math.floor(Date.now() / 1000) + 10_000;
    const { app } = makeApp({
      fetchRaw: vi.fn(async () => ({ tags: [], content: "", createdAt: future })),
    });
    const res = await request(app)
      .post("/api/profile/follow/template")
      .set("Cookie", COOKIE)
      .send({ target: TARGET, action: "follow" });
    expect(res.status).toBe(200);
    expect(res.body.template.created_at).toBeGreaterThan(future);
  });

  it("401 when there is no session", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/profile/follow/template")
      .send({ target: TARGET, action: "follow" });
    expect(res.status).toBe(401);
  });

  it("400 self_follow when the target resolves to the session pubkey", async () => {
    const { app, deps } = makeApp();
    const res = await request(app)
      .post("/api/profile/follow/template")
      .set("Cookie", COOKIE)
      .send({ target: SELF, action: "follow" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("self_follow");
    expect(deps.fetchRaw).not.toHaveBeenCalled();
  });

  it("400 invalid_target when the target cannot be resolved to a hex pubkey", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .post("/api/profile/follow/template")
      .set("Cookie", COOKIE)
      .send({ target: "not-a-pubkey", action: "follow" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_target");
  });
});

describe("POST /api/profile/follow — sovereign (client-signed {event}) (AC-6)", () => {
  it("publishes a valid signed kind-3 whose pubkey matches the session, echoing following:true", async () => {
    const { event, pubkey } = signedKind3([["p", TARGET]]);
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => sovereign(pubkey)),
    });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ event, target: TARGET, action: "follow" });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.following).toBe(true);
  });

  it("echoes following:false on a sovereign unfollow submit", async () => {
    const { event, pubkey } = signedKind3([]);
    const { app } = makeApp({ sessionUser: vi.fn(async () => sovereign(pubkey)) });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ event, target: TARGET, action: "unfollow" });
    expect(res.status).toBe(200);
    expect(res.body.following).toBe(false);
  });

  it("403 when the signed event pubkey is not the session user", async () => {
    const { event } = signedKind3([["p", TARGET]]);
    const { app, deps } = makeApp(); // session pubkey is SELF, event is someone else
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ event, target: TARGET, action: "follow" });
    expect(res.status).toBe(403);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("400 self_follow when the hinted target is the session pubkey (sovereign)", async () => {
    const { event, pubkey } = signedKind3([["p", SELF]]);
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => sovereign(pubkey)) });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ event, target: pubkey, action: "follow" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("self_follow");
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("502 when publishing to the relay fails", async () => {
    const { event, pubkey } = signedKind3([["p", TARGET]]);
    const { app } = makeApp({
      sessionUser: vi.fn(async () => sovereign(pubkey)),
      publish: vi.fn(async () => ({ ok: false as const, reason: "relay down" })),
    });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ event, target: TARGET, action: "follow" });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/profile/follow — custodial (server-signed {target, action}) (AC-7)", () => {
  it("server-merges + signs the kind-3 and publishes it (no client event in the body)", async () => {
    const { event } = signedKind3([["p", TARGET]]);
    let signedTemplate: { kind: number; tags: string[][] } | undefined;
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(SELF)),
      fetchRaw: vi.fn(async () => ({
        tags: [["p", "b".repeat(64)]],
        content: "",
        createdAt: 100,
      })),
      custodialSign: vi.fn(async (_id: string, template: { kind: number; tags: string[][] }) => {
        signedTemplate = template;
        return event as never;
      }),
    });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ target: TARGET, action: "follow" });
    expect(res.status).toBe(200);
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.following).toBe(true);
    // The server merged: the signed template adds the target and keeps the friend.
    expect(signedTemplate!.kind).toBe(3);
    expect(signedTemplate!.tags).toContainEqual(["p", TARGET]);
    expect(signedTemplate!.tags).toContainEqual(["p", "b".repeat(64)]);
  });

  it("custodial unfollow removes only the target and echoes following:false", async () => {
    const { event } = signedKind3([]);
    let signedTemplate: { tags: string[][] } | undefined;
    const { app } = makeApp({
      sessionUser: vi.fn(async () => custodial(SELF)),
      fetchRaw: vi.fn(async () => ({
        tags: [["p", TARGET], ["p", "b".repeat(64)]],
        content: "",
        createdAt: 100,
      })),
      custodialSign: vi.fn(async (_id: string, template: { tags: string[][] }) => {
        signedTemplate = template;
        return event as never;
      }),
    });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ target: TARGET, action: "unfollow" });
    expect(res.status).toBe(200);
    expect(res.body.following).toBe(false);
    expect(signedTemplate!.tags).not.toContainEqual(["p", TARGET]);
    expect(signedTemplate!.tags).toContainEqual(["p", "b".repeat(64)]);
  });

  it("custodial first follow with NO existing kind-3 publishes a fresh single-follow list (Q5)", async () => {
    const { event } = signedKind3([["p", TARGET]]);
    let signedTemplate: { tags: string[][] } | undefined;
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(SELF)),
      fetchRaw: vi.fn(async () => ({ tags: null, content: "", createdAt: null })),
      custodialSign: vi.fn(async (_id: string, template: { tags: string[][] }) => {
        signedTemplate = template;
        return event as never;
      }),
    });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ target: TARGET, action: "follow" });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(signedTemplate!.tags).toEqual([["p", TARGET]]);
  });

  it("401 reauth_required when the custodial session has no live signing key", async () => {
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(SELF)),
      custodialSign: vi.fn(async () => null), // wrap gone (post-restart)
    });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ target: TARGET, action: "follow" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("400 self_follow on a custodial submit before signing", async () => {
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(SELF)),
    });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ target: SELF, action: "follow" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("self_follow");
    expect(deps.custodialSign).not.toHaveBeenCalled();
  });
});

describe("POST /api/profile/follow — idempotent no-op still publishes/echoes (AC-3/AC-4)", () => {
  it("custodial follow of an ALREADY-followed target still publishes and echoes following:true (no dup)", async () => {
    const { event } = signedKind3([["p", TARGET]]);
    let signedTemplate: { tags: string[][] } | undefined;
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(SELF)),
      fetchRaw: vi.fn(async () => ({
        tags: [["p", TARGET, "wss://r", "bob"]],
        content: "",
        createdAt: 100,
      })),
      custodialSign: vi.fn(async (_id: string, template: { tags: string[][] }) => {
        signedTemplate = template;
        return event as never;
      }),
    });
    const res = await request(app)
      .post("/api/profile/follow")
      .set("Cookie", COOKIE)
      .send({ target: TARGET, action: "follow" });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.following).toBe(true);
    const targetTags = signedTemplate!.tags.filter((t) => t[0] === "p" && t[1] === TARGET);
    expect(targetTags).toHaveLength(1);
  });
});

describe("POST /api/profile/follow — anonymous", () => {
  it("401 when there is no session (sovereign event body)", async () => {
    const { event } = signedKind3([["p", TARGET]]);
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/profile/follow")
      .send({ event, target: TARGET, action: "follow" });
    expect(res.status).toBe(401);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("401 when there is no session (custodial intent body)", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/profile/follow")
      .send({ target: TARGET, action: "follow" });
    expect(res.status).toBe(401);
  });
});

describe("GET /api/profile/follows/:target — follow status read (AC-2)", () => {
  it("returns { following: true } when the viewer's kind-3 has the target p-tag", async () => {
    const { app } = makeApp({
      fetchRaw: vi.fn(async () => ({
        tags: [["p", "b".repeat(64)], ["p", TARGET, "wss://r"]],
        content: "",
        createdAt: 100,
      })),
    });
    const res = await request(app)
      .get(`/api/profile/follows/${TARGET}`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.following).toBe(true);
  });

  it("returns { following: false } when the viewer's kind-3 does NOT contain the target", async () => {
    const { app } = makeApp({
      fetchRaw: vi.fn(async () => ({
        tags: [["p", "b".repeat(64)]],
        content: "",
        createdAt: 100,
      })),
    });
    const res = await request(app)
      .get(`/api/profile/follows/${TARGET}`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.following).toBe(false);
  });

  it("returns { following: false } when the viewer has no kind-3 at all", async () => {
    const { app } = makeApp({
      fetchRaw: vi.fn(async () => ({ tags: null, content: "", createdAt: null })),
    });
    const res = await request(app)
      .get(`/api/profile/follows/${TARGET}`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.following).toBe(false);
  });

  it("self-target → { following: false } (you never follow yourself)", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get(`/api/profile/follows/${SELF}`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(200);
    expect(res.body.following).toBe(false);
  });

  it("401 when signed out (status is viewer-scoped)", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).get(`/api/profile/follows/${TARGET}`);
    expect(res.status).toBe(401);
  });

  it("404 not_found when :target is unresolvable", async () => {
    const { app } = makeApp();
    const res = await request(app)
      .get(`/api/profile/follows/not-a-pubkey`)
      .set("Cookie", COOKIE);
    expect(res.status).toBe(404);
  });
});
