import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import { buildAuthRouter, type AuthDeps } from "../../src/routes/auth";
import type { PublicUser } from "../../src/auth/users";

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
};

const sovereign: PublicUser = {
  id: "22222222-2222-2222-2222-222222222222",
  email: null,
  displayName: "npub1n0ewa…rk23",
  npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23",
  keyExportedAt: null,
};

const baseDeps: AuthDeps = {
  config: cfg,
  signup: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(async () => {}),
  me: vi.fn(async () => null),
};

function makeApp(overrides: Partial<AuthDeps> = {}) {
  const app = express();
  app.use(express.json());
  app.use("/", buildAuthRouter({ ...baseDeps, ...overrides }));
  return app;
}

describe("POST /auth/nostr/challenge", () => {
  it("returns a challenge for a valid pubkey", async () => {
    const nostrChallenge = vi.fn(async () => ({ challenge: "nonce-123" }));
    const res = await request(makeApp({ nostrChallenge }))
      .post("/auth/nostr/challenge")
      .send({ pubkey: "9".repeat(64) });
    expect(res.status).toBe(200);
    expect(res.body.challenge).toBe("nonce-123");
    expect(nostrChallenge).toHaveBeenCalledWith("9".repeat(64));
  });

  it("returns 400 for a malformed pubkey", async () => {
    const nostrChallenge = vi.fn(async () => ({ challenge: "x" }));
    const res = await request(makeApp({ nostrChallenge }))
      .post("/auth/nostr/challenge")
      .send({ pubkey: "not-hex" });
    expect(res.status).toBe(400);
    expect(nostrChallenge).not.toHaveBeenCalled();
  });
});

describe("POST /auth/nostr/verify", () => {
  it("returns 200 + user + session cookie on a verified signature", async () => {
    const nostrVerify = vi.fn(async () => ({
      user: sovereign,
      token: "sov-token",
      expiresAt: new Date(Date.now() + 1000),
    }));
    const res = await request(makeApp({ nostrVerify }))
      .post("/auth/nostr/verify")
      .send({ event: { kind: 22242, pubkey: "9".repeat(64) } });
    expect(res.status).toBe(200);
    expect(res.body.user.npub).toBe(sovereign.npub);
    expect(res.body.user.email).toBeNull();
    expect(res.headers["set-cookie"]?.[0] ?? "").toMatch(/^session=/);
    expect(res.headers["set-cookie"]?.[0] ?? "").toMatch(/HttpOnly/i);
  });

  it("returns 401 with a generic message when verification fails", async () => {
    const nostrVerify = vi.fn(async () => null);
    const res = await request(makeApp({ nostrVerify }))
      .post("/auth/nostr/verify")
      .send({ event: { kind: 22242, pubkey: "9".repeat(64) } });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_signature");
  });
});
