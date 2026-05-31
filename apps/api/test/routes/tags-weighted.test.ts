// FAILING TESTS — Story 25 / ADR 0025. Observer-aware GET /api/books/:slug/tags.
// Intentionally red until the Implementer makes the tags route observer-aware
// (resolve ?observer= else config.houseObserverPubkey, fetch trust.weights once,
// aggregate weighted, degrade to raw on any trust failure, echo observer npub).
//
// Trust is injected as the route's `trust` dep — a FixtureTrustProvider built
// directly with a known spec, or a throwing stub — so everything is
// deterministic with no Brainstorm/relay/network and no intra-module vi.mock.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
// The Implementer adds `trust?: TrustProvider` to TagsDeps (mirrors RatingsDeps).
import { buildTagsRouter, type TagsDeps, type TagsSessionUser } from "../../src/routes/tags";
import { FixtureTrustProvider } from "../../src/trust";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "f".repeat(64); // default house observer hex
const cfg = {
  port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
  tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
  trustProvider: "fixture",
  databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x",
  librarianPubkey: LIB, houseObserverPubkey: HOUSE,
} as Config;

const HDR_TAGS = { kind: 39998 as const, pubkey: LIB, dTag: "book-tags" };
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };

function taxEvent(slug: string, type: "genre" | "style" | "signal", sensitivity: "normal" | "accusatory") {
  const t = toWireTemplate(toBookTagEvent({ slug, type, name: slug, sensitivity, parentHeader: HDR_TAGS }), 1);
  return { id: "x", pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}
function signedAssertion(sk: Uint8Array, bookSlug: string, tagSlug: string, polarity: 1 | -1 = 1) {
  const a = {
    bookSlug, bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug, tagType: "genre" as const, polarity,
    asserterPubkey: asHexPubkey(getPublicKey(sk)), parentHeader: HDR_ASSERT,
  };
  const tmpl = toWireTemplate(toBookTagAssertionEvent(a), Math.floor(Date.now() / 1000));
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

const sovereign: TagsSessionUser = { id: "u", pubkeyHex: "9".repeat(64), tier: "sovereign" };

function makeApp(over: Partial<TagsDeps> = {}) {
  const deps: TagsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    query: vi.fn(async () => []),
    custodialSign: vi.fn(async () => null),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildTagsRouter(deps));
  return { app, deps };
}

// Returns the two-query closure the tags route uses: book-tags taxonomy vs
// book-tag-assertions, dispatched by the `#z` filter suffix.
function queryFor(tax: SignedNostrEvent[], asserts: SignedNostrEvent[]) {
  return vi.fn(async (f: Record<string, unknown>) =>
    (f["#z"] as string[])[0]!.endsWith("book-tags") ? tax : asserts,
  );
}

describe("GET /api/books/:slug/tags — AC-5 observer awareness", () => {
  it("echoes the resolved observer (npub) and applies trust-weighting from that vantage", async () => {
    const curator = generateSecretKey();
    const rando = generateSecretKey();
    const tax = [taxEvent("literary-fiction", "genre", "normal")];
    const asserts = [
      signedAssertion(curator, "b1", "literary-fiction", 1),
      signedAssertion(rando, "b1", "literary-fiction", -1),
    ];
    const observerHex = "c".repeat(64);
    const trust = new FixtureTrustProvider({
      weights: { [observerHex]: { [getPublicKey(curator)]: 0.9 } },
    });
    const { app } = makeApp({ query: queryFor(tax, asserts) as never, trust });

    const res = await request(app).get("/api/books/b1/tags?observer=" + observerHex);
    expect(res.status).toBe(200);
    expect(res.body.observer).toBe(npubEncode(observerHex)); // echoes the npub
    expect(res.body.weighted).toBe(true); // trusted curator's apply surfaced
    const lf = res.body.genres.find((g: { slug: string }) => g.slug === "literary-fiction");
    expect(lf.trusted).toBe(true);
    expect(lf.applies).toBe(1); // raw counts preserved
    expect(lf.disputes).toBe(1);
  });

  it("defaults to the house observer when no ?observer= is given", async () => {
    const curator = generateSecretKey();
    const tax = [taxEvent("literary-fiction", "genre", "normal")];
    const asserts = [signedAssertion(curator, "b1", "literary-fiction", 1)];
    const trust = new FixtureTrustProvider({
      weights: { [HOUSE]: { [getPublicKey(curator)]: 0.8 } },
    });
    const { app } = makeApp({ query: queryFor(tax, asserts) as never, trust });

    const res = await request(app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.observer).toBe(npubEncode(HOUSE));
    expect(res.body.weighted).toBe(true);
  });

  it("two observers see two different trusted sets for the same book (POV-first)", async () => {
    const curatorA = generateSecretKey();
    const curatorB = generateSecretKey();
    const tax = [taxEvent("literary-fiction", "genre", "normal")];
    const asserts = [
      signedAssertion(curatorA, "b1", "literary-fiction", 1),
      signedAssertion(curatorB, "b1", "literary-fiction", -1),
    ];
    const obsA = "a".repeat(64);
    const obsB = "b".repeat(64);
    // obsA trusts curatorA (apply); obsB trusts curatorB (dispute).
    const trust = new FixtureTrustProvider({
      weights: {
        [obsA]: { [getPublicKey(curatorA)]: 0.9 },
        [obsB]: { [getPublicKey(curatorB)]: 0.9 },
      },
    });
    const a = await request(makeApp({ query: queryFor(tax, asserts) as never, trust }).app)
      .get("/api/books/b1/tags?observer=" + obsA);
    const b = await request(makeApp({ query: queryFor(tax, asserts) as never, trust }).app)
      .get("/api/books/b1/tags?observer=" + obsB);

    // Both are trusted-vantage reads (each has a positively-trusted asserter)
    // but the two observers disagree on the tag's standing — their weighted
    // results differ. The exact surfacing is the aggregator's; here we assert
    // the two responses are not identical, proving the read is POV-dependent.
    expect(a.body.weighted).toBe(true);
    expect(b.body.weighted).toBe(true);
    expect(JSON.stringify(a.body)).not.toBe(JSON.stringify(b.body));
  });
});

describe("GET /api/books/:slug/tags — AC-7 honest degrade", () => {
  it("no trust dep configured → raw community view: every trusted:false, weighted:false, 200", async () => {
    const tax = [taxEvent("literary-fiction", "genre", "normal")];
    const asserts = [signedAssertion(generateSecretKey(), "b1", "literary-fiction", 1)];
    const { app } = makeApp({ query: queryFor(tax, asserts) as never }); // no `trust`

    const res = await request(app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.weighted).toBe(false);
    expect(res.body.genres.find((g: { slug: string }) => g.slug === "literary-fiction").trusted).toBe(false);
    // Raw counts still intact (catalog never looks empty).
    expect(res.body.genres.find((g: { slug: string }) => g.slug === "literary-fiction").applies).toBe(1);
  });

  it("trust provider throws → degrades to raw, never 500, no fabricated trusted numbers", async () => {
    const tax = [taxEvent("literary-fiction", "genre", "normal")];
    const asserts = [signedAssertion(generateSecretKey(), "b1", "literary-fiction", 1)];
    const throwing = {
      name: "fixture" as const,
      weights: vi.fn(async () => {
        throw new Error("trust backend down");
      }),
      hasScores: vi.fn(async () => true),
      authChallenge: vi.fn(async () => "c"),
      personalize: vi.fn(async () => true),
    };
    const { app } = makeApp({ query: queryFor(tax, asserts) as never, trust: throwing });

    const res = await request(app).get("/api/books/b1/tags?observer=" + "c".repeat(64));
    expect(res.status).toBe(200); // never 500
    expect(res.body.weighted).toBe(false);
    for (const t of [...res.body.genres, ...res.body.styles, ...res.body.signals]) {
      expect(t.trusted).toBe(false);
    }
  });

  it("observer trusts none of the asserters → community view (weighted:false), raw intact", async () => {
    const tax = [taxEvent("literary-fiction", "genre", "normal")];
    const asserts = [signedAssertion(generateSecretKey(), "b1", "literary-fiction", 1)];
    const trust = new FixtureTrustProvider({ weights: {} }); // observer trusts no one
    const { app } = makeApp({ query: queryFor(tax, asserts) as never, trust });

    const res = await request(app).get("/api/books/b1/tags?observer=" + "c".repeat(64));
    expect(res.status).toBe(200);
    expect(res.body.weighted).toBe(false);
    expect(res.body.genres.find((g: { slug: string }) => g.slug === "literary-fiction").applies).toBe(1);
  });
});
