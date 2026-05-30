import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { asHexPubkey, toBookRecordEvent, toWireTemplate, buildBookSubmissionsHeaderAddress, type SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildSubmissionsRouter, type SubmissionsDeps, type SubmissionsSessionUser } from "../../src/routes/submissions";

const LIB = asHexPubkey("1".repeat(63) + "a");
const cfg = { librarianPubkey: LIB } as unknown as Config;
const HDR = buildBookSubmissionsHeaderAddress(LIB);

function signedSubmission(sk: Uint8Array, title: string) {
  const rec = {
    slug: `sub--${title}--x`, title, authorName: "Ada", format: "reference" as const,
    source: "community" as const, parentHeader: HDR,
  };
  const tmpl = toWireTemplate(toBookRecordEvent(rec), Math.floor(Date.now() / 1000));
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

const sovereign: SubmissionsSessionUser = { id: "u", pubkeyHex: "9".repeat(64), tier: "sovereign" };

function makeApp(over: Partial<SubmissionsDeps> = {}) {
  const deps: SubmissionsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => []),
    custodialSign: vi.fn(async () => null),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildSubmissionsRouter(deps));
  return { app, deps };
}

describe("POST /api/submissions", () => {
  it("sovereign: publishes a valid signed submission", async () => {
    const sk = generateSecretKey();
    const ev = signedSubmission(sk, "Alpha");
    const { app, deps } = makeApp({ sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: getPublicKey(sk) })) });
    const res = await request(app).post("/api/submissions").send({ event: ev });
    expect(res.status).toBe(200);
    expect(deps.publish).toHaveBeenCalledTimes(1);
  });

  it("sovereign: 403 on pubkey mismatch", async () => {
    const ev = signedSubmission(generateSecretKey(), "Alpha"); // session pubkey is 9*64
    expect((await request(makeApp().app).post("/api/submissions").send({ event: ev })).status).toBe(403);
  });

  it("custodial: server-signs the intent; 401 reauth without a wrap", async () => {
    const sk = generateSecretKey();
    const ok = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, tier: "custodial", pubkeyHex: getPublicKey(sk) })),
      custodialSign: vi.fn(async () => signedSubmission(sk, "Beta")),
    });
    expect((await request(ok.app).post("/api/submissions").set("Cookie", "session=" + "x".repeat(43)).send({ title: "Beta", authorName: "Ada" })).status).toBe(200);

    const noWrap = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, tier: "custodial" })),
      custodialSign: vi.fn(async () => null),
    });
    const r = await request(noWrap.app).post("/api/submissions").set("Cookie", "session=" + "x".repeat(43)).send({ title: "Beta", authorName: "Ada" });
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe("reauth_required");
  });

  it("custodial: 400 on missing title", async () => {
    const r = await request(makeApp({ sessionUser: vi.fn(async () => ({ ...sovereign, tier: "custodial" })) }).app)
      .post("/api/submissions").set("Cookie", "session=x").send({ authorName: "Ada" });
    expect(r.status).toBe(400);
  });
});

describe("GET /api/submissions/mine", () => {
  it("lists the user's submissions", async () => {
    const sk = generateSecretKey();
    const ev = signedSubmission(sk, "Alpha");
    const { app } = makeApp({
      sessionUser: vi.fn(async () => ({ ...sovereign, pubkeyHex: getPublicKey(sk) })),
      query: vi.fn(async () => [ev]),
    });
    const res = await request(app).get("/api/submissions/mine");
    expect(res.status).toBe(200);
    expect(res.body.submissions[0].title).toBe("Alpha");
  });
  it("401 without a session", async () => {
    expect((await request(makeApp({ sessionUser: vi.fn(async () => null) }).app).get("/api/submissions/mine")).status).toBe(401);
  });
});

describe("GET /api/submissions (public list)", () => {
  it("lists all submissions with the submitter npub, no auth needed", async () => {
    const a = signedSubmission(generateSecretKey(), "Alpha");
    const b = signedSubmission(generateSecretKey(), "Beta");
    const { app } = makeApp({
      sessionUser: vi.fn(async () => null), // public — must not require a session
      query: vi.fn(async () => [a, b]),
    });
    const res = await request(app).get("/api/submissions");
    expect(res.status).toBe(200);
    expect(res.body.submissions).toHaveLength(2);
    expect(res.body.submissions[0].submitter).toMatch(/^npub1/);
  });
});
