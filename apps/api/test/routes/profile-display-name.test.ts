// Failing tests (red) for Story 27b — the custodial display-name rename endpoint.
// ADR 0028, new file `apps/api/src/routes/profile-display-name.ts`:
//   `buildProfileDisplayNameRouter({ config, sessionUser, publish, fetchRaw,
//   custodialSign, updateDisplayName })` mirrors `buildProfileSubstackRouter`'s
//   tier-branched custodial-write DI shape PLUS the `updateDisplayName` Postgres
//   lockstep. Single route:
//     POST /api/profile/display-name — tier-branched, target is ALWAYS the
//     session user (no request-body user id):
//       anonymous            → 401 no_session (no fetch/sign/publish/DB)
//       invalid display name → 400 invalid_display_name (BEFORE fetch/sign/publish/DB)
//       sovereign            → 403 sovereign_self_signed (nothing built/signed/published/DB)
//       custodial, no key    → 401 reauth_required (no publish/DB)
//       custodial, live key  → fetchRaw → buildProfileKind0Content(prev,{displayName:D2},D2)
//                              → buildKind0Template(merged, nextCreatedAt(fetched))
//                              → custodialSign → publish (await LOCAL)
//                                  !ok    → 502 publish_failed (DB UNCHANGED)
//                              → updateDisplayName(user.id, D2)
//                                  throws → 502 publish_failed (kind-0 already live)
//                              → 200 { displayName: D2 }
//
// Determinism: the clock is the route's `nextCreatedAt` (which bumps strictly
// past the fetched event). We assert the published event's `created_at` is
// STRICTLY GREATER than the fetched `createdAt` we inject — no Date.now in the
// asserted output. The publisher / fetcher / signer are injected vi.fn (no live
// relay). No intra-module vi.mock.
//
// The router does not exist yet → import fails → red.
import express from "express";
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import type { Config } from "../../src/config";
import {
  buildProfileDisplayNameRouter,
  type ProfileDisplayNameDeps,
  type SessionUser,
} from "../../src/routes/profile-display-name";

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
const D2 = "Mira Reborn";

function sovereign(pubkeyHex: string): SessionUser {
  return { id: "u-sov", pubkeyHex, tier: "sovereign", displayName: "Mira" };
}
function custodial(pubkeyHex: string, displayName = "Mira"): SessionUser {
  return { id: "u-cust", pubkeyHex, tier: "custodial", displayName };
}

/**
 * A signer mock that REALLY signs the template it is handed, with a fresh
 * keypair, so the published event is wire-realistic AND we can read the merged
 * content / created_at straight off the returned signed event. We also capture
 * the template the route built so assertions don't depend on the signer.
 */
function capturingSigner() {
  const sk = generateSecretKey();
  const pubkey = getPublicKey(sk);
  const captured: { template?: { content: string; created_at: number; kind: number; tags: string[][] } } = {};
  const fn = vi.fn(
    async (
      _sessionIdHex: string,
      template: { content: string; created_at: number; kind: number; tags: string[][] },
    ) => {
      captured.template = template;
      const signed = finalizeEvent(
        {
          kind: template.kind,
          created_at: template.created_at,
          tags: template.tags,
          content: template.content,
        },
        sk,
      );
      return JSON.parse(JSON.stringify(signed)) as typeof signed;
    },
  );
  return { sk, pubkey, captured, fn };
}

function makeApp(overrides: Partial<ProfileDisplayNameDeps> = {}) {
  const deps: ProfileDisplayNameDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => custodial("9".repeat(64))),
    publish: vi.fn(async () => ({ ok: true as const, id: "evt-id" })),
    fetchRaw: vi.fn(async () => ({ content: null, createdAt: null })),
    custodialSign: vi.fn(async () => null),
    updateDisplayName: vi.fn(async () => undefined),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildProfileDisplayNameRouter(deps));
  return { app, deps };
}

afterEach(() => vi.clearAllMocks());

// ───────────────────────────────────────────────────────────────────────────
// AC-1 — Rename re-publishes, merge-preserving other fields.
// ───────────────────────────────────────────────────────────────────────────
describe("POST /api/profile/display-name — AC-1 (rename re-publishes, merge-preserving)", () => {
  it("merges name+display_name into the freshest kind-0 and preserves substack/website, signs and publishes with a strictly-newer created_at", async () => {
    const FETCHED_AT = 1_000_000;
    const signer = capturingSigner();
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(signer.pubkey)),
      fetchRaw: vi.fn(async () => ({
        content: {
          name: "Mira",
          display_name: "Mira",
          substack: "https://mira.substack.com",
          website: "https://mira.example",
        },
        createdAt: FETCHED_AT,
      })),
      custodialSign: signer.fn,
    });

    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: D2 });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ displayName: D2 });

    // The server fetched the freshest raw kind-0 for the SESSION user.
    expect(deps.fetchRaw).toHaveBeenCalledTimes(1);
    expect(deps.fetchRaw).toHaveBeenCalledWith(signer.pubkey);

    // The signer was handed a kind-0 template (flat metadata, empty tags).
    expect(deps.custodialSign).toHaveBeenCalledTimes(1);
    const tmpl = signer.captured.template!;
    expect(tmpl.kind).toBe(0);
    expect(tmpl.tags).toEqual([]);

    // Merge-preserve: new name in BOTH fields, prior fields untouched.
    const content = JSON.parse(tmpl.content) as Record<string, unknown>;
    expect(content.name).toBe(D2);
    expect(content.display_name).toBe(D2);
    expect(content.substack).toBe("https://mira.substack.com");
    expect(content.website).toBe("https://mira.example");

    // Published the SIGNED event (kind 0, authored by the session user).
    expect(deps.publish).toHaveBeenCalledTimes(1);
    const published = (deps.publish as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { kind: number; pubkey: string; created_at: number };
    expect(published.kind).toBe(0);
    expect(published.pubkey).toBe(signer.pubkey);

    // Strictly-newer created_at so the NIP-01 replacement wins.
    expect(published.created_at).toBeGreaterThan(FETCHED_AT);
    expect(tmpl.created_at).toBeGreaterThan(FETCHED_AT);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-2 — Postgres displayName updated in lockstep, AFTER a successful publish.
// ───────────────────────────────────────────────────────────────────────────
describe("POST /api/profile/display-name — AC-2 (DB lockstep)", () => {
  it("calls updateDisplayName exactly once with (user.id, D2) on success", async () => {
    const signer = capturingSigner();
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(signer.pubkey)),
      fetchRaw: vi.fn(async () => ({ content: { name: "Mira" }, createdAt: 100 })),
      custodialSign: signer.fn,
    });

    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: D2 });

    expect(res.status).toBe(200);
    expect(deps.updateDisplayName).toHaveBeenCalledTimes(1);
    expect(deps.updateDisplayName).toHaveBeenCalledWith("u-cust", D2);
  });

  it("does NOT update the DB when the local publish fails (publish ordered before DB)", async () => {
    const signer = capturingSigner();
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(signer.pubkey)),
      fetchRaw: vi.fn(async () => ({ content: { name: "Mira" }, createdAt: 100 })),
      custodialSign: signer.fn,
      publish: vi.fn(async () => ({ ok: false as const, reason: "relay down" })),
    });

    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: D2 });

    expect(res.status).toBe(502);
    expect(deps.updateDisplayName).not.toHaveBeenCalled();
  });

  it("does NOT update the DB on a 401 / 400 / 403 failure path", async () => {
    // 401 anon
    {
      const { app, deps } = makeApp({ sessionUser: vi.fn(async () => null) });
      await request(app).post("/api/profile/display-name").send({ displayName: D2 });
      expect(deps.updateDisplayName).not.toHaveBeenCalled();
    }
    // 400 invalid name
    {
      const { app, deps } = makeApp({
        sessionUser: vi.fn(async () => custodial("9".repeat(64))),
      });
      await request(app)
        .post("/api/profile/display-name")
        .set("Cookie", COOKIE)
        .send({ displayName: "   " });
      expect(deps.updateDisplayName).not.toHaveBeenCalled();
    }
    // 403 sovereign
    {
      const { app, deps } = makeApp({
        sessionUser: vi.fn(async () => sovereign("9".repeat(64))),
      });
      await request(app)
        .post("/api/profile/display-name")
        .set("Cookie", COOKIE)
        .send({ displayName: D2 });
      expect(deps.updateDisplayName).not.toHaveBeenCalled();
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-3 — Authnz: own profile only.
// ───────────────────────────────────────────────────────────────────────────
describe("POST /api/profile/display-name — AC-3 (authnz own-profile-only)", () => {
  it("401 no_session for an anonymous request, with no publish/sign/fetch/DB", async () => {
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app)
      .post("/api/profile/display-name")
      .send({ displayName: D2 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("no_session");
    expect(deps.fetchRaw).not.toHaveBeenCalled();
    expect(deps.custodialSign).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.updateDisplayName).not.toHaveBeenCalled();
  });

  it("401 reauth_required when a custodial session has no live signing key (custodialSign → null), no publish/DB", async () => {
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial("9".repeat(64))),
      fetchRaw: vi.fn(async () => ({ content: { name: "Mira" }, createdAt: 100 })),
      custodialSign: vi.fn(async () => null), // wrap gone (post-restart / evicted)
    });
    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: D2 });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("reauth_required");
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.updateDisplayName).not.toHaveBeenCalled();
  });

  it("renames the SESSION user and ignores any user id in the request body (no body-id path)", async () => {
    const signer = capturingSigner();
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(signer.pubkey)),
      fetchRaw: vi.fn(async () => ({ content: { name: "Mira" }, createdAt: 100 })),
      custodialSign: signer.fn,
    });
    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      // A malicious body trying to target someone else.
      .send({ displayName: D2, userId: "victim-id", id: "victim-id", pubkeyHex: "f".repeat(64) });

    expect(res.status).toBe(200);
    // The DB write targets the SESSION user id, never the body id.
    expect(deps.updateDisplayName).toHaveBeenCalledWith("u-cust", D2);
    // The fetch + publish are for the SESSION user's pubkey, never the body's.
    expect(deps.fetchRaw).toHaveBeenCalledWith(signer.pubkey);
    const published = (deps.publish as ReturnType<typeof vi.fn>).mock
      .calls[0]![0] as { pubkey: string };
    expect(published.pubkey).toBe(signer.pubkey);
    expect(published.pubkey).not.toBe("f".repeat(64));
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-4 — Input validation + privacy whitelist preserved.
// ───────────────────────────────────────────────────────────────────────────
describe("POST /api/profile/display-name — AC-4 (validation + privacy)", () => {
  it("400 invalid_display_name BEFORE any fetch/sign/publish/DB on an empty/whitespace name", async () => {
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial("9".repeat(64))),
    });
    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: "   " });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_display_name");
    expect(deps.fetchRaw).not.toHaveBeenCalled();
    expect(deps.custodialSign).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.updateDisplayName).not.toHaveBeenCalled();
  });

  it("400 invalid_display_name on a name over the length cap (101 chars), before any I/O", async () => {
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial("9".repeat(64))),
    });
    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: "a".repeat(101) });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("invalid_display_name");
    expect(deps.publish).not.toHaveBeenCalled();
  });

  it("the rename never introduces session/request-body PII into the published kind-0, and merge-preserves the prior whitelisted fields", async () => {
    // Scope (gate adjudication / ADR 0028 §5): AC-4 tests that the rename never
    // INTRODUCES PII from the surfaces it controls — the SESSION and the
    // REQUEST BODY — into the published kind-0. It does NOT test scrubbing of a
    // pre-poisoned `rawPrev`: `rawPrev` is already-public relay data and the
    // route reuses Story-27's `buildProfileKind0Content`, whose `rawPrev`
    // passthrough is lossless by design (no new merge logic / whitelist here).
    const EMAIL = "reader-secret@example.com";
    const signer = capturingSigner();
    // The session the route receives carries the user's real email (a realistic
    // SessionUser surface). The route must never pull it into the kind-0.
    const sessionWithEmail: SessionUser = {
      id: "u-cust",
      pubkeyHex: signer.pubkey,
      tier: "custodial",
      displayName: "Mira",
      email: EMAIL,
    } as SessionUser & { email: string };
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => sessionWithEmail),
      // A WHITELIST-CLEAN prior kind-0 (legit public fields only). This also
      // lets us assert merge-preserve keeps substack/website.
      fetchRaw: vi.fn(async () => ({
        content: {
          name: "Old Name",
          substack: "https://mira.substack.com",
          website: "https://example.com",
        },
        createdAt: 100,
      })),
      custodialSign: signer.fn,
    });

    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      // A malicious body smuggling extra fields: the route must use ONLY
      // `displayName` and ignore email/password/userId entirely.
      .send({ displayName: D2, email: EMAIL, password: "hunter2", userId: "leak-me" });

    expect(res.status).toBe(200);

    // THE no-PII assertion: serialize the WHOLE signed event and prove that
    // neither the session email, the body password, nor the body userId appear
    // ANYWHERE (content + tags + every field). This fails the moment a future
    // change pipes session or request-body PII into the event.
    const published = (deps.publish as ReturnType<typeof vi.fn>).mock.calls[0]![0];
    expect(JSON.stringify(published)).not.toContain(EMAIL);
    expect(JSON.stringify(published)).not.toContain("hunter2");
    expect(JSON.stringify(published)).not.toContain("leak-me");

    // The parsed content carries no PII keys: the rename never INTRODUCES
    // email/password/userId/session token from the session or the request body.
    const content = JSON.parse(
      (published as { content: string }).content,
    ) as Record<string, unknown>;
    expect(content).not.toHaveProperty("email");
    expect(content).not.toHaveProperty("password");
    expect(content).not.toHaveProperty("userId");

    // The rename applied: name == display_name == D2.
    expect(content.name).toBe(D2);
    expect(content.display_name).toBe(D2);

    // Merge-preserve: the prior whitelisted fields are retained untouched.
    expect(content.substack).toBe("https://mira.substack.com");
    expect(content.website).toBe("https://example.com");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// AC-6 — Sovereign untouched.
// ───────────────────────────────────────────────────────────────────────────
describe("POST /api/profile/display-name — AC-6 (sovereign untouched)", () => {
  it("403 sovereign_self_signed and nothing built/signed/published/DB-updated", async () => {
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => sovereign("9".repeat(64))),
    });
    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: D2 });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("sovereign_self_signed");
    expect(deps.fetchRaw).not.toHaveBeenCalled();
    expect(deps.custodialSign).not.toHaveBeenCalled();
    expect(deps.publish).not.toHaveBeenCalled();
    expect(deps.updateDisplayName).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Failure posture (ADR 0028 §3) — surface the local-publish error as 502.
// ───────────────────────────────────────────────────────────────────────────
describe("POST /api/profile/display-name — failure posture (502 publish_failed)", () => {
  it("502 publish_failed when the local publish returns { ok: false }, DB UNCHANGED", async () => {
    const signer = capturingSigner();
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(signer.pubkey)),
      fetchRaw: vi.fn(async () => ({ content: { name: "Mira" }, createdAt: 100 })),
      custodialSign: signer.fn,
      publish: vi.fn(async () => ({ ok: false as const, reason: "relay down" })),
    });
    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: D2 });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("publish_failed");
    expect(deps.updateDisplayName).not.toHaveBeenCalled();
  });

  it("502 publish_failed when updateDisplayName throws AFTER a successful publish (kind-0 already live)", async () => {
    const signer = capturingSigner();
    const { app, deps } = makeApp({
      sessionUser: vi.fn(async () => custodial(signer.pubkey)),
      fetchRaw: vi.fn(async () => ({ content: { name: "Mira" }, createdAt: 100 })),
      custodialSign: signer.fn,
      publish: vi.fn(async () => ({ ok: true as const, id: "evt-id" })),
      updateDisplayName: vi.fn(async () => {
        throw new Error("db down");
      }),
    });
    const res = await request(app)
      .post("/api/profile/display-name")
      .set("Cookie", COOKIE)
      .send({ displayName: D2 });
    expect(res.status).toBe(502);
    expect(res.body.error.code).toBe("publish_failed");
    // The publish DID happen (canonical store written first).
    expect(deps.publish).toHaveBeenCalledTimes(1);
    expect(deps.updateDisplayName).toHaveBeenCalledTimes(1);
  });
});
