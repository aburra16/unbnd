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

const sampleUser: PublicUser = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "reader@example.com",
  displayName: "Mira Calloway",
  npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23",
};

function makeApp(overrides: Partial<AuthDeps> = {}) {
  const deps: AuthDeps = {
    config: cfg,
    signup: vi.fn(async () => ({
      user: sampleUser,
      token: "tok-signup",
      expiresAt: new Date(Date.now() + 1000),
    })),
    login: vi.fn(async () => ({
      user: sampleUser,
      token: "tok-login",
      expiresAt: new Date(Date.now() + 1000),
    })),
    logout: vi.fn(async () => {}),
    me: vi.fn(async () => sampleUser),
    ...overrides,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildAuthRouter(deps));
  return app;
}

describe("POST /auth/signup", () => {
  it("returns 201, the public user, and a session cookie on success", async () => {
    const res = await request(makeApp())
      .post("/auth/signup")
      .send({ email: "reader@example.com", password: "abcdefghij", displayName: "Mira Calloway" });
    expect(res.status).toBe(201);
    expect(res.body.user.npub).toBe(sampleUser.npub);
    expect(res.body.user).not.toHaveProperty("pubkeyHex");
    expect(res.body.user).not.toHaveProperty("encryptedNsecPassword");
    const cookie = res.headers["set-cookie"]?.[0] ?? "";
    expect(cookie).toMatch(/^session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it("returns 400 on a too-short password", async () => {
    const res = await request(makeApp())
      .post("/auth/signup")
      .send({ email: "reader@example.com", password: "short", displayName: "Mira" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("validation_failed");
  });

  it("returns 409 when the email is already in use", async () => {
    const res = await request(
      makeApp({
        signup: vi.fn(async () => {
          throw Object.assign(new Error("dup"), { code: "email_in_use" });
        }),
      }),
    )
      .post("/auth/signup")
      .send({ email: "taken@example.com", password: "abcdefghij", displayName: "X" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("email_in_use");
  });
});

describe("POST /auth/login", () => {
  it("returns 200 + cookie on valid credentials", async () => {
    const res = await request(makeApp())
      .post("/auth/login")
      .send({ email: "reader@example.com", password: "abcdefghij" });
    expect(res.status).toBe(200);
    expect(res.body.user.npub).toBe(sampleUser.npub);
    expect(res.headers["set-cookie"]?.[0] ?? "").toMatch(/^session=/);
  });

  it("returns 401 with a generic message on bad credentials", async () => {
    const res = await request(makeApp({ login: vi.fn(async () => null) }))
      .post("/auth/login")
      .send({ email: "reader@example.com", password: "wrong-password" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("invalid_credentials");
    expect(res.body.error.message).toBe("Email or password is incorrect.");
  });

  it("forwards the incoming session cookie to the login dep for rotation", async () => {
    const login = vi.fn(async () => ({
      user: sampleUser,
      token: "rotated",
      expiresAt: new Date(Date.now() + 1000),
    }));
    await request(makeApp({ login }))
      .post("/auth/login")
      .set("Cookie", "session=old-token")
      .send({ email: "reader@example.com", password: "abcdefghij" });
    expect(login).toHaveBeenCalledWith(expect.anything(), "old-token");
  });
});

describe("POST /auth/logout", () => {
  it("returns 204 and clears the cookie", async () => {
    const res = await request(makeApp())
      .post("/auth/logout")
      .set("Cookie", "session=tok");
    expect(res.status).toBe(204);
    expect(res.headers["set-cookie"]?.[0] ?? "").toMatch(/session=;|Max-Age=0/i);
  });

  it("returns 204 even with no cookie present", async () => {
    const res = await request(makeApp()).post("/auth/logout");
    expect(res.status).toBe(204);
  });
});

describe("GET /auth/me", () => {
  it("returns 200 + user when the session resolves", async () => {
    const res = await request(makeApp())
      .get("/auth/me")
      .set("Cookie", "session=tok");
    expect(res.status).toBe(200);
    expect(res.body.user.npub).toBe(sampleUser.npub);
  });

  it("returns 401 when no session resolves", async () => {
    const res = await request(makeApp({ me: vi.fn(async () => null) })).get("/auth/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("no_session");
  });
});
