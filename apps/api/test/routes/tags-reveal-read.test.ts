// FAILING TESTS (red) — Story 33 / ADR 0034 §3. The book-tags read surfaces an
// accusatory tag ONLY when a LIVE reveal event exists for that (book, tag) —
// latest state `revealed` surfaces it, latest `withdrawn` hides it, no reveal at
// all keeps it hidden (the honest default). The reveal lookup is ONE batched
// query scoped to this book (#a), reduced to the latest-per-(book,tag) d-tag.
// Canonical assertions are NEVER mutated (filter-at-read).
//
// AC-3: no reveal → accusatory dropped (existing behavior preserved).
// AC-4: a live `revealed` event → that ONE accusatory tag surfaces; a sibling
//   accusatory tag with no reveal stays hidden; ONE batched reveal query (no N+1).
// AC-6: latest `withdrawn` (superseding an earlier `revealed`) → hidden again.
//   A revealed tag surfaces attributed (a `revealed` marker the web can tell
//   apart), NOT as community consensus, with no emergent count flipping it.
//
// RED until tags.ts adds the third parallel reveal query
// (`#z: accusatory-reveals`, `#a: <book>`), reduces to the live revealed slug
// set, and passes it to aggregateBookTagsWeighted.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toAccusatoryRevealEvent,
  toWireTemplate,
  type AccusatoryReveal,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildTagsRouter, type TagsDeps, type TagsSessionUser } from "../../src/routes/tags";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HOUSE = "f".repeat(64);
const cfg = {
  port: 8787, strfryUrl: "ws://x", neo4jBoltUrl: "x", neo4jUser: "neo4j", neo4jPassword: "x",
  tapestryApiUrl: "x", searchUrl: "x", searchApiKey: "x", searchProvider: "meili",
  trustProvider: "fixture",
  databaseUrl: "x", backupEncryptionKey: "a".repeat(64), publicOrigin: "x",
  librarianPubkey: LIB, houseObserverPubkey: HOUSE, curatorThreshold: 0.5,
} as unknown as Config;

const HDR_TAGS = { kind: 39998 as const, pubkey: LIB, dTag: "book-tags" };
const HDR_ASSERT = { kind: 39998 as const, pubkey: LIB, dTag: "book-tag-assertions" };
const HDR_REVEALS = { kind: 39998 as const, pubkey: LIB, dTag: "accusatory-reveals" };

function taxEvent(slug: string, type: "genre" | "style" | "signal", sensitivity: "normal" | "accusatory") {
  const t = toWireTemplate(toBookTagEvent({ slug, type, name: slug, sensitivity, parentHeader: HDR_TAGS }), 1);
  return { id: `tax-${slug}`, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

function signedAssertion(sk: Uint8Array, bookSlug: string, tagSlug: string, tagType: "genre" | "style" | "signal") {
  const a = {
    bookSlug, bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug, tagType, polarity: 1 as const,
    asserterPubkey: asHexPubkey(getPublicKey(sk)), parentHeader: HDR_ASSERT,
  };
  const tmpl = toWireTemplate(toBookTagAssertionEvent(a), 1_700_000_000);
  return JSON.parse(JSON.stringify(finalizeEvent(tmpl as never, sk))) as SignedNostrEvent;
}

// A librarian-signed reveal/withdraw event for (book, tag) at created_at.
function revealEvent(bookSlug: string, tagSlug: string, state: "revealed" | "withdrawn", createdAt: number) {
  const reveal: AccusatoryReveal = {
    bookSlug,
    bookAddress: { kind: 39999, pubkey: LIB, dTag: bookSlug },
    tagSlug,
    state,
    parentHeader: HDR_REVEALS,
  };
  const t = toWireTemplate(toAccusatoryRevealEvent(reveal), createdAt);
  return { id: `reveal-${bookSlug}-${tagSlug}-${state}-${createdAt}`, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

const TAXONOMY = [
  taxEvent("literary-fiction", "genre", "normal"),
  taxEvent("ai-generated", "signal", "accusatory"),
  taxEvent("possibly-ai-generated", "signal", "accusatory"),
];

const sovereign: TagsSessionUser = { id: "u", pubkeyHex: "9".repeat(64), tier: "sovereign" };

// A query that dispatches the three concept filters the read makes:
// book-tags (taxonomy), book-tag-assertions (assertions, #a-scoped), and the
// NEW accusatory-reveals (reveal events, #a-scoped). Records each call so a
// test can assert the reveal lookup is a SINGLE batched query (no N+1).
function makeQuery(opts: {
  asserts: SignedNostrEvent[];
  reveals: SignedNostrEvent[];
}) {
  const calls: Record<string, unknown>[] = [];
  const query = vi.fn(async (f: Record<string, unknown>) => {
    calls.push(f);
    const z = (f["#z"] as string[] | undefined)?.[0] ?? "";
    if (z.endsWith("book-tags")) return TAXONOMY;
    if (z.endsWith("accusatory-reveals")) return opts.reveals;
    return opts.asserts; // book-tag-assertions
  });
  return { query, calls };
}

function makeApp(over: Partial<TagsDeps> & { query: TagsDeps["query"] }) {
  const deps: TagsDeps = {
    config: cfg,
    sessionUser: vi.fn(async () => sovereign),
    publish: vi.fn(async () => ({ ok: true as const, id: "e" })),
    custodialSign: vi.fn(async () => null),
    ...over,
  };
  const app = express();
  app.use(express.json());
  app.use("/", buildTagsRouter(deps));
  return { app, deps };
}

describe("GET /api/books/:slug/tags — accusatory hidden by default (AC-3)", () => {
  it("an accusatory assertion with NO reveal does NOT surface", async () => {
    const sk = generateSecretKey();
    const asserts = [
      signedAssertion(sk, "b1", "literary-fiction", "genre"),
      signedAssertion(generateSecretKey(), "b1", "ai-generated", "signal"),
    ];
    const { query } = makeQuery({ asserts, reveals: [] });
    const res = await request(makeApp({ query }).app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.genres.find((g: { slug: string }) => g.slug === "literary-fiction").applies).toBe(1);
    expect(JSON.stringify(res.body)).not.toContain("ai-generated");
  });
});

describe("GET /api/books/:slug/tags — a live reveal surfaces ONE (book,tag) (AC-4)", () => {
  it("a live `revealed` event surfaces that accusatory tag, marked revealed and attributed (not consensus)", async () => {
    const sk = generateSecretKey();
    const asserts = [signedAssertion(sk, "b1", "ai-generated", "signal")];
    const reveals = [revealEvent("b1", "ai-generated", "revealed", 1_700_000_100)];
    const { query } = makeQuery({ asserts, reveals });
    const res = await request(makeApp({ query }).app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    const sig = res.body.signals.find((s: { slug: string }) => s.slug === "ai-generated");
    expect(sig).toBeDefined();
    // It carries a `revealed` marker the web can tell apart from genre/style chips.
    expect(sig.revealed).toBe(true);
    // It is NOT labeled "community consensus" / "trusted" by virtue of the reveal.
    expect(sig.trusted).toBe(false);
  });

  it("a sibling accusatory tag with NO reveal stays hidden while one is revealed", async () => {
    const asserts = [
      signedAssertion(generateSecretKey(), "b1", "ai-generated", "signal"),
      signedAssertion(generateSecretKey(), "b1", "possibly-ai-generated", "signal"),
    ];
    const reveals = [revealEvent("b1", "ai-generated", "revealed", 1_700_000_100)];
    const { query } = makeApp({ query: makeQuery({ asserts, reveals }).query }) as never;
    void query;
    const q = makeQuery({ asserts, reveals });
    const res = await request(makeApp({ query: q.query }).app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.signals.find((s: { slug: string }) => s.slug === "ai-generated")).toBeDefined();
    expect(res.body.signals.find((s: { slug: string }) => s.slug === "possibly-ai-generated")).toBeUndefined();
  });

  it("the reveal lookup is ONE batched query scoped to this book (no N+1)", async () => {
    const asserts = [signedAssertion(generateSecretKey(), "b1", "ai-generated", "signal")];
    const reveals = [revealEvent("b1", "ai-generated", "revealed", 1_700_000_100)];
    const { query, calls } = makeQuery({ asserts, reveals });
    await request(makeApp({ query }).app).get("/api/books/b1/tags");
    const revealCalls = calls.filter(
      (f) => ((f["#z"] as string[] | undefined)?.[0] ?? "").endsWith("accusatory-reveals"),
    );
    expect(revealCalls.length).toBe(1);
    // Scoped to this one book by #a (not a per-tag scan).
    expect((revealCalls[0]!["#a"] as string[])[0]).toBe(`39999:${LIB}:b1`);
  });
});

describe("GET /api/books/:slug/tags — reveal is reversible; canonical never mutated (AC-6)", () => {
  it("latest state `withdrawn` (superseding an earlier `revealed`) hides the tag again", async () => {
    const sk = generateSecretKey();
    const asserts = [signedAssertion(sk, "b1", "ai-generated", "signal")];
    // Two events at the SAME (book,tag) address: revealed earlier, withdrawn later.
    const reveals = [
      revealEvent("b1", "ai-generated", "revealed", 1_700_000_100),
      revealEvent("b1", "ai-generated", "withdrawn", 1_700_000_200),
    ];
    const { query } = makeQuery({ asserts, reveals });
    const res = await request(makeApp({ query }).app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("ai-generated");
  });

  it("an out-of-order event set still keys on the LATEST created_at per (book,tag)", async () => {
    const sk = generateSecretKey();
    const asserts = [signedAssertion(sk, "b1", "ai-generated", "signal")];
    // Withdrawn is OLDER; revealed is NEWER → latest wins → surfaced.
    const reveals = [
      revealEvent("b1", "ai-generated", "withdrawn", 1_700_000_100),
      revealEvent("b1", "ai-generated", "revealed", 1_700_000_300),
    ];
    const { query } = makeQuery({ asserts, reveals });
    const res = await request(makeApp({ query }).app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(res.body.signals.find((s: { slug: string }) => s.slug === "ai-generated")).toBeDefined();
  });

  it("a flood of accusatory assertions does NOT flip visibility without a reveal (no emergent reveal)", async () => {
    const asserts = Array.from({ length: 12 }, () =>
      signedAssertion(generateSecretKey(), "b1", "ai-generated", "signal"),
    );
    const { query } = makeQuery({ asserts, reveals: [] }); // no reveal event
    const res = await request(makeApp({ query }).app).get("/api/books/b1/tags");
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain("ai-generated");
  });
});
