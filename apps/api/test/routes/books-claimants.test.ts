// Failing tests (red) for Story 31 / ADR 0032 §2(a) — the per-book claimant set
// (the AuthorBadge data). `GET /api/books/:slug` gains a sibling claims read
// (query { kinds:[39999], "#z":[book-claims header], "#a":[bookAtag] }), dedupes
// by claimant (a replaced claim under the same d-tag collapses), sorts
// deterministically, and returns `claimants: { npub }[]` ALONGSIDE `book`. npub
// only — hex never leaves the server. Empty array when there are no claims.
//
// Red until books.ts runs the parallel claims read and projects `claimants`.
// Trust-INDEPENDENT: DI'd `query`, no trust input. The current books test
// (books.test.ts) is migrated separately to assert `claimants: []` on the
// no-claims path.
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookClaimEvent,
  toBookRecordEvent,
  toWireTemplate,
  type BookClaim,
  type BookRecord,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildBooksRouter, type BooksDeps } from "../../src/routes/books";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR = buildBookRecordsHeaderAddress(LIB);
const CLAIMS_HDR: DListAddress<39998> = { kind: 39998, pubkey: LIB, dTag: "book-claims" };
const cfg = { librarianPubkey: LIB } as unknown as Config;

function bookEvent(slug: string, title: string, createdAt = 1): SignedNostrEvent {
  const rec: BookRecord = {
    slug, title, authorName: `Author of ${title}`, format: "reference",
    source: "openlibrary", parentHeader: HDR, blurb: "x", publishYear: 2000,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), createdAt);
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

// A wire BookClaim for a fresh keypair (unsigned-shape is enough for a read; the
// route parses tags, it does not verify here). Carries the `json` payload tag so
// `fromWireEvent` can reconstruct it, mirroring the catalog read.
function claimEvent(slug: string, claimantHex: string, createdAt = 1): SignedNostrEvent {
  const claim: BookClaim = {
    bookSlug: slug,
    bookAddress: { kind: 39999, pubkey: LIB, dTag: slug },
    claimantPubkey: asHexPubkey(claimantHex),
    parentHeader: CLAIMS_HDR,
  };
  const unsigned = toBookClaimEvent(claim);
  const tags = [...unsigned.tags.map((t) => [...t]), ["json", JSON.stringify(unsigned.payload)]];
  return { id: `${slug}-${claimantHex.slice(0, 8)}-${createdAt}`, pubkey: claimantHex, sig: "x", created_at: createdAt, kind: 39999, tags, content: "" } as unknown as SignedNostrEvent;
}

function freshHex(): string {
  return getPublicKey(generateSecretKey());
}

// A query that routes by filter: the book read (#d present) returns the record;
// the claims read (#z = book-claims) returns the supplied claim set.
function routedQuery(book: SignedNostrEvent | null, claims: SignedNostrEvent[]) {
  return vi.fn(async (filter: Record<string, unknown>): Promise<SignedNostrEvent[]> => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-claims")) return claims;
    return book ? [book] : [];
  });
}

function makeApp(query: BooksDeps["query"]) {
  const deps: BooksDeps = { config: cfg, query };
  const app = express();
  app.use("/", buildBooksRouter(deps));
  return app;
}

describe("GET /api/books/:slug — claimants enrichment (AC-2)", () => {
  it("returns an empty claimants array when no one has claimed the book", async () => {
    const app = makeApp(routedQuery(bookEvent("ol-a", "Alpha"), []));
    const res = await request(app).get("/api/books/ol-a");
    expect(res.status).toBe(200);
    expect(res.body.book.title).toBe("Alpha");
    expect(res.body.claimants).toEqual([]);
  });

  it("returns one claimant (by npub) when a single user has claimed it", async () => {
    const hex = freshHex();
    const app = makeApp(routedQuery(bookEvent("ol-a", "Alpha"), [claimEvent("ol-a", hex)]));
    const res = await request(app).get("/api/books/ol-a");
    expect(res.status).toBe(200);
    expect(res.body.claimants).toEqual([{ npub: npubEncode(hex) }]);
  });

  it("returns N distinct claimants for a multi-claimed book (the open-claim hazard)", async () => {
    const a = freshHex();
    const b = freshHex();
    const app = makeApp(
      routedQuery(bookEvent("ol-a", "Alpha"), [
        claimEvent("ol-a", a, 1),
        claimEvent("ol-a", b, 2),
      ]),
    );
    const res = await request(app).get("/api/books/ol-a");
    expect(res.status).toBe(200);
    const npubs = res.body.claimants.map((c: { npub: string }) => c.npub).sort();
    expect(npubs).toEqual([npubEncode(a), npubEncode(b)].sort());
    expect(res.body.claimants).toHaveLength(2);
  });

  it("dedupes a replaced claim (same claimant, two events under one d-tag) to one claimant", async () => {
    const hex = freshHex();
    const app = makeApp(
      routedQuery(bookEvent("ol-a", "Alpha"), [
        claimEvent("ol-a", hex, 1),
        claimEvent("ol-a", hex, 9), // re-claim / replace
      ]),
    );
    const res = await request(app).get("/api/books/ol-a");
    expect(res.status).toBe(200);
    expect(res.body.claimants).toEqual([{ npub: npubEncode(hex) }]);
  });

  it("never leaks the claimant hex pubkey on the wire", async () => {
    const hex = freshHex();
    const app = makeApp(routedQuery(bookEvent("ol-a", "Alpha"), [claimEvent("ol-a", hex)]));
    const res = await request(app).get("/api/books/ol-a");
    expect(JSON.stringify(res.body)).not.toContain(hex);
  });
});
