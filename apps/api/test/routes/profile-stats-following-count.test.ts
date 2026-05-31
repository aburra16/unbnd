// Failing tests (red) for Story 23 AC-9 — followingCount folded into the public
// GET /api/profile/:npub/stats. ADR 0023 Decision 3 (F2-A): inside statsFor, a
// fourth parallel, independently-wrapped read of the TARGET's freshest kind-3;
// followingCount = the count of DISTINCT `p`-tag hexes (a present 0 when they
// have a kind-3 with no follows, or no kind-3); OMIT followingCount on throw
// (same omit-on-throw discipline as booksRated/reviews/tagsApplied). The count
// is honest and UNCAPPED (one user's own bounded kind-3).
//
// The kind-3 read is driven through the existing injected `query` dep with a
// `{ kinds: [3], authors: [target], limit: 1 }` filter (the stats route runs it
// as a fourth parallel read). The CURRENT statsFor runs only the three
// 39999-scoped reads and never emits followingCount → these assertions fail for
// the right reason (the field is absent / the kind-3 read is never issued).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import { asHexPubkey, type SignedNostrEvent } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import {
  buildProfileStatsRouter,
  type ProfileStatsDeps,
} from "../../src/routes/profile-stats";

const LIB = asHexPubkey("1".repeat(63) + "a");
const TARGET_SK = generateSecretKey();
const TARGET_HEX = asHexPubkey(getPublicKey(TARGET_SK));
const TARGET_NPUB = npubEncode(TARGET_HEX);

const cfg = {
  port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
  tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x", librarianPubkey: LIB,
} as Config;

function k3(tags: string[][], created_at = 1): SignedNostrEvent {
  return {
    id: "k3-" + created_at, pubkey: TARGET_HEX, sig: "s",
    kind: 3, created_at, tags, content: "",
  } as SignedNostrEvent;
}

/** Dispatch the injected `query` by kind: 39999 reads return [] (no ratings/
 *  tags here, that is covered elsewhere); kind-3 reads return `kind3()`. */
function queryByKind(kind3: () => SignedNostrEvent[] | Promise<SignedNostrEvent[]>) {
  return vi.fn(async (filter: Record<string, unknown>) => {
    const kinds = (filter.kinds as number[]) ?? [];
    if (kinds.includes(3)) return kind3();
    return [];
  });
}

function makeApp(over: Partial<ProfileStatsDeps> & { now?: () => number } = {}) {
  const query = over.query ?? vi.fn(async () => []);
  const deps: Partial<ProfileStatsDeps> & { now?: () => number } = {
    config: cfg,
    sessionUser: vi.fn(async () => null),
    query,
    queryPaged: vi.fn(async (filter) => ({ events: await query(filter), capped: false })),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildProfileStatsRouter(deps as ProfileStatsDeps));
  return { app, deps };
}

describe("GET /api/profile/:npub/stats — followingCount (AC-9)", () => {
  it("returns followingCount = the target's distinct kind-3 p-tag count", async () => {
    const query = queryByKind(() => [
      k3([
        ["p", "b".repeat(64)],
        ["p", "c".repeat(64), "wss://relay.damus.io"],
        ["p", "d".repeat(64), "wss://nos.lol", "alice"],
        ["t", "books"], // a non-p tag must NOT be counted
      ]),
    ]);
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.followingCount).toBe(3);
  });

  it("counts DISTINCT p-tag hexes (a duplicate p tag is not double-counted)", async () => {
    const query = queryByKind(() => [
      k3([
        ["p", "b".repeat(64)],
        ["p", "b".repeat(64), "wss://relay.damus.io"], // same hex, different payload
        ["p", "c".repeat(64)],
      ]),
    ]);
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.followingCount).toBe(2);
  });

  it("reads the kind-3 author-scoped to the resolved TARGET hex", async () => {
    const query = queryByKind(() => [k3([["p", "b".repeat(64)]])]);
    const { app } = makeApp({ query: query as never });
    await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    const k3Call = query.mock.calls.find((c) =>
      ((c[0] as { kinds?: number[] }).kinds ?? []).includes(3),
    );
    expect(k3Call).toBeDefined();
    expect((k3Call![0] as { authors?: string[] }).authors).toEqual([TARGET_HEX]);
  });

  it("shows a present 0 when the target has a kind-3 with no follows", async () => {
    const query = queryByKind(() => [k3([])]);
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.followingCount).toBe(0);
    expect("followingCount" in res.body.stats).toBe(true);
  });

  it("shows a present 0 when the target has no kind-3 at all", async () => {
    const query = queryByKind(() => []);
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect(res.body.stats.followingCount).toBe(0);
  });

  it("OMITS followingCount when the kind-3 read throws (omit-on-throw, never a fabricated 0)", async () => {
    const query = queryByKind(() => {
      throw new Error("relay boom on kind-3");
    });
    const { app } = makeApp({ query: query as never });
    const res = await request(app).get(`/api/profile/${TARGET_NPUB}/stats`);
    expect(res.status).toBe(200);
    expect("followingCount" in res.body.stats).toBe(false);
  });
});
