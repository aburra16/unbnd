// FAILING TESTS (red) — Story 60 (index-on-write), ADR 0059 Q2 + survey verdict
// (AC: "Ratings do not touch the index"). A rating publish changes no
// SearchDocument field (ranking stays a query-time rerank), so the ratings route
// must NOT carry or fire an index-on-write hook. This is the CONTROL for the
// tags hook: ratings are a no-op by construction (no `reindexBook` in the
// RatingsDeps surface, no trigger in `POST /api/ratings`).
//
// We inject a `reindexBook` spy onto the ratings deps (via cast — the property is
// intentionally NOT in RatingsDeps) and assert a successful rating publish never
// calls it. This is GREEN today (the ratings route has no hook) and must STAY
// green after the Implementer lands the tags + promoter hooks: it pins that the
// hook was added to the tags route ONLY, never leaking into the ratings path.
//
// (Included in the red set as the negative-space guard for the feature; it
// fails only if a future change wrongly wires a reindex into the ratings route.)
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config";
import {
  buildRatingsRouter,
  type RatingsDeps,
  type SessionUser,
} from "../../src/routes/ratings";
import { LIBRARIAN, signedRating } from "../ratings/_fixtures";

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

describe("POST /api/ratings → NO index write (ADR 0059, AC: ratings do not touch the index)", () => {
  it("a successful sovereign rating publish never invokes a reindex hook", async () => {
    const { sk, event } = signedRating({ bookSlug: "orbital", score: 4 });
    const sovereign: SessionUser = {
      id: "u1",
      pubkeyHex: event.pubkey,
      tier: "sovereign",
    };
    // Inject a reindex spy via cast — RatingsDeps intentionally has no such field.
    const reindexBook = vi.fn();
    const deps = {
      config: cfg,
      sessionUser: vi.fn(async () => sovereign),
      publish: vi.fn(async () => ({ ok: true as const, id: "evt-id" })),
      query: vi.fn(async () => []),
      reindexBook,
    } as unknown as RatingsDeps;
    void sk;

    const app = express();
    app.use(express.json());
    app.use("/", buildRatingsRouter(deps));

    const res = await request(app).post("/api/ratings").send({ event });
    expect(res.status).toBe(200);
    expect(reindexBook).not.toHaveBeenCalled();
  });
});
