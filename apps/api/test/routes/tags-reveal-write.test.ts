// Story 78 / ADR 0076 — the in-product accusatory reveal endpoint
// (POST /api/books/:slug/tags/:tagSlug/reveal). Curator-gated enqueue; the api
// only enqueues (the worker mints). DI + fixture trust, no relay/worker.
// FAILING until the route gates (session/accusatory/curator) + calls enqueueReveal
// (it currently stubs to 501).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  toBookTagEvent,
  toWireTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import { buildTagsRouter, type TagsDeps, type TagsSessionUser } from "../../src/routes/tags";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "b".repeat(64);
const ABOVE = "c".repeat(64); // weight 0.9 → curator
const BELOW = "e".repeat(64); // absent → weight 0
const HDR_TAGS = { kind: 39998 as const, pubkey: LIB, dTag: "book-tags" };

function cfg(): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    trustProvider: "fixture",
  } as unknown as Config;
}
function userOf(hex: string): TagsSessionUser {
  return { pubkeyHex: hex, tier: "sovereign" } as unknown as TagsSessionUser;
}
function taxEvent(slug: string, type: "genre" | "signal", sensitivity: "normal" | "accusatory") {
  const t = toWireTemplate(toBookTagEvent({ slug, type, name: slug, sensitivity, parentHeader: HDR_TAGS }), 1);
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

// The taxonomy read (isAccusatorySlug): ai-generated (accusatory) + literary-fiction (normal).
const TAX = [taxEvent("ai-generated", "signal", "accusatory"), taxEvent("literary-fiction", "genre", "normal")];

function makeApp(over: Partial<TagsDeps> = {}) {
  const enqueueReveal = vi.fn(async () => ({ status: "queued" as const }));
  const deps: TagsDeps = {
    config: cfg(),
    sessionUser: vi.fn(async () => userOf(ABOVE)),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => TAX), // every read returns the taxonomy (only isAccusatorySlug reads here)
    trust: new FixtureTrustProvider({ weights: { [HOUSE]: { [ABOVE]: 0.9 } } }),
    enqueueReveal,
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildTagsRouter(deps));
  return { app, enqueueReveal };
}

describe("POST /api/books/:slug/tags/:tagSlug/reveal (Story 78 / ADR 0076)", () => {
  it("a curator reveals an accusatory tag → 200, enqueued with the curator as requestedBy", async () => {
    const { app, enqueueReveal } = makeApp();
    const res = await request(app)
      .post("/api/books/dune/tags/ai-generated/reveal")
      .send({ state: "revealed" });
    expect(res.status).toBe(200);
    expect(enqueueReveal).toHaveBeenCalledWith("dune", "ai-generated", "revealed", ABOVE);
  });

  it("a curator can withdraw (state: withdrawn)", async () => {
    const { app, enqueueReveal } = makeApp();
    const res = await request(app)
      .post("/api/books/dune/tags/ai-generated/reveal")
      .send({ state: "withdrawn" });
    expect(res.status).toBe(200);
    expect(enqueueReveal).toHaveBeenCalledWith("dune", "ai-generated", "withdrawn", ABOVE);
  });

  it("401 when not signed in", async () => {
    const { app, enqueueReveal } = makeApp({ sessionUser: vi.fn(async () => null) });
    const res = await request(app).post("/api/books/dune/tags/ai-generated/reveal").send({ state: "revealed" });
    expect(res.status).toBe(401);
    expect(enqueueReveal).not.toHaveBeenCalled();
  });

  it("403 for a below-gate (non-curator) user", async () => {
    const { app, enqueueReveal } = makeApp({ sessionUser: vi.fn(async () => userOf(BELOW)) });
    const res = await request(app).post("/api/books/dune/tags/ai-generated/reveal").send({ state: "revealed" });
    expect(res.status).toBe(403);
    expect(enqueueReveal).not.toHaveBeenCalled();
  });

  it("400 for a non-accusatory tag (nothing to reveal)", async () => {
    const { app, enqueueReveal } = makeApp();
    const res = await request(app).post("/api/books/dune/tags/literary-fiction/reveal").send({ state: "revealed" });
    expect(res.status).toBe(400);
    expect(enqueueReveal).not.toHaveBeenCalled();
  });
});
