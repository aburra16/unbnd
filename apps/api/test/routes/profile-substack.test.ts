// Failing tests (red) for Story 22 — the three-tier kind-0 write endpoints.
// ADR 0022 Decision 2, new file `apps/api/src/routes/profile-substack.ts`:
//   `buildProfileSubstackRouter({ config, sessionUser, publish, fetchRaw,
//   custodialSign })` mirrors `buildRatingsRouter`. Routes:
//     POST /api/profile/substack/template — sovereign: session-gated (401),
//       400 on malformed URL, else fetchRaw → merge → return { template }
//       (kind 0, tags [], merged content, created_at bumped past the fetched
//       event so NIP-01 replacement wins).
//     POST /api/profile/substack — tier-branched submit:
//       sovereign: { event } → validateSignedKind0 (kind/pubkey/sig/substack) →
//         publish; pubkey mismatch → 403; invalid → 400.
//       custodial: { url } → fetchRaw + merge + custodialSign → publish;
//         custodialSign null → 401 reauth_required; malformed url → 400.
//       anonymous → 401.
// The router does not exist yet → import fails → red.
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { Config } from "../../src/config";
import {
  buildProfileSubstackRouter,
  type ProfileSubstackDeps,
  type SessionUser,
} from "../../src/routes/profile-substack";

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

function sovereign(pubkeyHex: string): SessionUser {
  return { id: "u-sov", pubkeyHex, tier: "sovereign" };
}
function custodial(pubkeyHex: string): SessionUser {
  return { id: "u-cust", pubkeyHex, tier: "custodial" };
}

/** A wire-realistic signed kind-0 for a fresh keypair. */
function signedKind0(content: Record<string, unknown>, sk = generateSecretKey()) {
  const pubkey = getPublicKey(sk);
  const signed = finalizeEvent(
    { kind: 0, created_at: Math.floor(Date.now() / 1000), tags: [], content: JSON.stringify(content) },
    sk,
  );
  return { sk, pubkey, event: JSON.parse(JSON.stringify(signed)) as typeof signed };
}

function makeApp(overrides: Partial<ProfileSubstackDeps> = {}) {
  const deps: ProfileSubstackDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign("9".repeat(64))),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt-id" })),
    fetchRaw: vi.fn(async () => ({ content: null, createdAt: null })),
    custodialSign: vi.fn(async () => null),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildProfileSubstackRouter(deps));
  return { app, deps };
}

afterEach(() => vi.clearAllMocks());

describe("POST /api/profile/substack/template (AC-1/2/6)", () => {
  it("returns a kind-0 template (kind 0, tags []) with the merged substack content", async () => {
    const { app } = makeApp({
      fetchRaw: vi.fn(async () => ({ content: { name: "mira", lud16: "m@w" }, createdAt: 100 })),
    });
    const res = await request(app)
      .post("/api/profile/substack/template")
      .set("Cookie", COOKIE)
      .send({ url: "https://mira.substack.com" });
    expect(res.status).toBe(200);
    expect(res.body.template.kind).toBe(0);
    expect(res.body.template.tags).toEqual([]);
    const content = JSON.parse(res.body.template.content);
    expect(content.substack).toBe("https://mira.substack.com");
    // Merge-don't-clobber: existing fields survive into the template.
    expect(content.name).toBe("mira");
    expect(content.lud16).toBe("m@w");
  });

  it("bumps created_at strictly past the fetched event so replacement wins (AC-8 propagation)", async () => {
    const future = Math.floor(Date.now() / 1000) + 10_000;
    const { app } = makeApp({
      fetchRaw: vi.fn(async () => ({ content: { name: "mira" }, createdAt: future })),
    });
    const res = await request(app)
      .post("/api/profile/substack/template")
      .set("Cookie", COOKIE)
      .send({ url: "https://mira.substack.com" });
    expect(res.status).toBe(200);
    expect(res.body.template.created_at).toBeGreaterThan(future);
  });

  it("401 when there is no session", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/profile/substack/template")
      .send({ url: "https://mira.substack.com" });
    expect(res.status).toBe(401);
  });

  it("400 on a malformed URL, before any fetch/merge (AC-5)", async () => {
    const fetchRaw = vi.fn(async () => ({ content: null, createdAt: null }));
    const { app } = makeApp({ fetchRaw });
    const res = await request(app)
      .post("/api/profile/substack/template")
      .set("Cookie", COOKIE)
      .send({ url: "javascript:alert(1)" });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/profile/substack — sovereign (client-signed {event}) (AC-6)", () => {
  it("publishes a valid signed kind-0 whose pubkey matches the session", async () => {
    const { event, pubkey } = signedKind0({ name: "mira", substack: "https://mira.substack.com" });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => sovereign(pubkey)),
    });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ event, url: "https://mira.substack.com" });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.substack).toBe("https://mira.substack.com");
  });

  it("403 when the signed event pubkey is not the session user", async () => {
    const { event } = signedKind0({ substack: "https://mira.substack.com" });
    const { app, deps } = makeApp(); // session pubkey is 9*64, event is someone else
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ event, url: "https://mira.substack.com" });
    expect(res.status).toBe(403);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("400 when the signed event carries an invalid (non-http(s)) substack", async () => {
    // eslint-disable-next-line no-script-url
    const { event, pubkey } = signedKind0({ substack: "javascript:alert(1)" });
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => sovereign(pubkey)) });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      // eslint-disable-next-line no-script-url
      .send({ event, url: "javascript:alert(1)" });
    expect(res.status).toBe(400);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("502 when publishing to the relay fails", async () => {
    const { event, pubkey } = signedKind0({ substack: "https://mira.substack.com" });
    const { app } = makeApp({
      sessionUser: vi.fn(async () => sovereign(pubkey)),
      publish: vi.fn(async () => ({ ok: false as const, reason: "relay down" })),
    });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ event, url: "https://mira.substack.com" });
    expect(res.status).toBe(502);
  });
});

describe("POST /api/profile/substack — custodial (server-signed {url}) (AC-7)", () => {
  it("server-signs the merged kind-0 and publishes it (no client event in the body)", async () => {
    const { event, pubkey } = signedKind0({ name: "mira", substack: "https://mira.substack.com" });
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(pubkey)),
      fetchRaw: vi.fn(async () => ({ content: { name: "mira" }, createdAt: 100 })),
      custodialSign: vi.fn(async () => event as never),
    });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ url: "https://mira.substack.com" });
    expect(res.status).toBe(200);
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(res.body.substack).toBe("https://mira.substack.com");
  });

  it("401 reauth_required when the session has no live signing key", async () => {
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial("9".repeat(64))),
      custodialSign: vi.fn(async () => null), // wrap gone (post-restart)
    });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ url: "https://mira.substack.com" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("an empty url CLEARS the field: the merged content has no substack key (AC-4)", async () => {
    let signedTemplate: { content: string } | undefined;
    const { app } = makeApp({
      sessionUser: vi.fn(async () => custodial("9".repeat(64))),
      fetchRaw: vi.fn(async () => ({
        content: { name: "mira", substack: "https://old.substack.com" },
        createdAt: 100,
      })),
      custodialSign: vi.fn(async (_id: string, template: { content: string }) => {
        signedTemplate = template;
        return { id: "e", content: template.content } as never;
      }),
    });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ url: "" });
    expect(res.status).toBe(200);
    const merged = JSON.parse(signedTemplate!.content);
    expect(merged).not.toHaveProperty("substack");
    expect(merged.name).toBe("mira"); // other fields preserved
  });

  it("custodial with NO existing kind-0 builds a fresh minimal kind-0 holding just substack (Q3)", async () => {
    let signedTemplate: { content: string } | undefined;
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial("9".repeat(64))),
      fetchRaw: vi.fn(async () => ({ content: null, createdAt: null })),
      custodialSign: vi.fn(async (_id: string, template: { content: string }) => {
        signedTemplate = template;
        return { id: "e", content: template.content } as never;
      }),
    });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ url: "https://mira.substack.com" });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(JSON.parse(signedTemplate!.content)).toEqual({
      substack: "https://mira.substack.com",
    });
  });

  it("400 on a malformed url before signing (AC-5)", async () => {
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial("9".repeat(64))),
    });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ url: "ftp://nope" });
    expect(res.status).toBe(400);
    expect(deps.custodialSign).not.toHaveBeenCalled();
  });
});

describe("POST /api/profile/substack — anonymous", () => {
  it("401 when there is no session (sovereign event body)", async () => {
    const { event } = signedKind0({ substack: "https://mira.substack.com" });
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/profile/substack")
      .send({ event });
    expect(res.status).toBe(401);
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("401 when there is no session (custodial url body)", async () => {
    const { app } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/profile/substack")
      .send({ url: "https://mira.substack.com" });
    expect(res.status).toBe(401);
  });
});

describe("POST /api/profile/substack — local publish gates the response (AC-8)", () => {
  // The injected `publish` is the kind-0 publisher (publishKind0): it awaits the
  // LOCAL relay and returns its result; the profile-relay fan-out is fire-and-
  // forget inside it. The route must await `publish` and let its result gate the
  // response — a local failure surfaces as 502, a local success as 200. (The
  // fan-out failure-doesn't-fail-the-save behavior is unit-tested on
  // publishToMany; here we pin that the route honors the awaited local result.)
  it("awaits publish and returns 200 on local success", async () => {
    const { event, pubkey } = signedKind0({ substack: "https://mira.substack.com" });
    const publish = vi.fn(async () => ({ ok: true as const, id: "e" }));
    const { app } = makeApp({ sessionUser: vi.fn(async () => sovereign(pubkey)), publish });
    const res = await request(app)
      .post("/api/profile/substack")
      .set("Cookie", COOKIE)
      .send({ event, url: "https://mira.substack.com" });
    expect(res.status).toBe(200);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});
