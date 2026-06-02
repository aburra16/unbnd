// Failing tests (red) for Story 32 / ADR 0033 §5 — the verified-only READ-MERGE
// on GET /api/books/:slug. The route now runs FOUR parallel reads (canonical,
// claims, author-verified assertions, author overlays), computes verification from
// the HOUSE vantage (count-gate, one batched weights call), and composes
// `effectiveBook` + `authorProvided` + per-claimant `verified` under the
// none-on-conflict rule:
//   - exactly ONE verified claimant → apply that author's latest overlay to
//     blurb/coverUrl/purchaseUrl ONLY; `authorProvided` lists the applied fields;
//     that claimant `verified:true`.
//   - a BARE (unverified) claim + an overlay → overlay NOT applied; canonical
//     renders; `authorProvided: []`; claimant `verified:false`.
//   - >1 verified claimant → NO overlay (`authorProvided: []`); ALL badged verified
//     (none-on-conflict).
//   - the canonical librarian record is NEVER mutated; the canonical value is
//     always recoverable; a cleared overlay field reverts to canonical.
//   - honest degrade (no trust/observer) → canonical + verified:false, never 500.
//
// All DI-driven: routed `query` + fixture `trust`. No Brainstorm, no relay, no
// human. No intra-module vi.mock; no Date.now in asserted output.
//
// Red until books.ts runs the 4-read merge (BooksDeps gains `trust`; uses config).
import express from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { npubEncode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookAuthorOverlayEvent,
  toBookClaimEvent,
  toBookRecordEvent,
  toAuthorVerifiedEvent,
  toWireTemplate,
  type AuthorVerifiedAssertion,
  type BookAuthorOverlay,
  type BookClaim,
  type BookRecord,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { FixtureTrustProvider } from "../../src/trust/fixture";
import { buildBooksRouter, type BooksDeps } from "../../src/routes/books";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR = buildBookRecordsHeaderAddress(LIB);
const CLAIMS_HDR: DListAddress<39998> = { kind: 39998, pubkey: LIB, dTag: "book-claims" };
const VERIFIED_HDR: DListAddress<39998> = { kind: 39998, pubkey: LIB, dTag: "author-verified" };
const EDITS_HDR: DListAddress<39998> = { kind: 39998, pubkey: LIB, dTag: "author-edits" };

const HOUSE = "b".repeat(64);
const AUTHOR = "a".repeat(64);
const AUTHOR2 = "7".repeat(64);
const CUR1 = "c".repeat(64);
const CUR2 = "d".repeat(64);

function cfg(over: Partial<Config> = {}): Config {
  return {
    librarianPubkey: LIB,
    houseObserverPubkey: HOUSE,
    curatorThreshold: 0.5,
    verifiedAuthorMinCurators: 2,
    ...over,
  } as unknown as Config;
}

// HOUSE trusts CUR1/CUR2 above the floor (two clear N=2 for whichever author).
function fixtureTrust() {
  return new FixtureTrustProvider({ weights: { [HOUSE]: { [CUR1]: 0.9, [CUR2]: 0.8 } } });
}

const CANONICAL_BLURB = "Librarian-seeded canonical blurb.";
const CANONICAL_COVER = "https://catalog.example/canonical.jpg";

function bookEvent(slug: string, title: string, createdAt = 1): SignedNostrEvent {
  const rec: BookRecord = {
    slug, title, authorName: `Author of ${title}`, format: "reference",
    source: "openlibrary", parentHeader: HDR, blurb: CANONICAL_BLURB,
    coverUrl: CANONICAL_COVER, publishYear: 2000,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), createdAt);
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

function claimEvent(slug: string, claimantHex: string, createdAt = 1): SignedNostrEvent {
  const claim: BookClaim = {
    bookSlug: slug,
    bookAddress: { kind: 39999, pubkey: LIB, dTag: slug },
    claimantPubkey: asHexPubkey(claimantHex),
    parentHeader: CLAIMS_HDR,
  };
  const unsigned = toBookClaimEvent(claim);
  const tags = [...unsigned.tags.map((t: readonly string[]) => [...t]), ["json", JSON.stringify(unsigned.payload)]];
  return { id: `${slug}-claim-${claimantHex.slice(0, 6)}`, pubkey: claimantHex, sig: "x", created_at: createdAt, kind: 39999, tags, content: "" } as unknown as SignedNostrEvent;
}

function verifiedEvent(slug: string, curatorHex: string, authorHex: string, polarity: 1 | -1, createdAt: number): SignedNostrEvent {
  const a: AuthorVerifiedAssertion = {
    bookSlug: slug,
    bookAddress: { kind: 39999, pubkey: LIB, dTag: slug },
    authorPubkey: asHexPubkey(authorHex),
    curatorPubkey: asHexPubkey(curatorHex),
    polarity,
    parentHeader: VERIFIED_HDR,
  };
  const unsigned = toAuthorVerifiedEvent(a);
  const tags = [...unsigned.tags.map((t: readonly string[]) => [...t]), ["json", JSON.stringify(unsigned.payload)]];
  return { id: `${slug}-ver-${curatorHex.slice(0, 6)}-${authorHex.slice(0, 6)}-${createdAt}`, pubkey: curatorHex, sig: "x", created_at: createdAt, kind: 39999, tags, content: "" } as unknown as SignedNostrEvent;
}

function overlayEvent(slug: string, authorHex: string, fields: { blurb?: string | null; coverUrl?: string | null; purchaseUrl?: string | null }, createdAt: number): SignedNostrEvent {
  const o: BookAuthorOverlay = {
    bookSlug: slug,
    bookAddress: { kind: 39999, pubkey: LIB, dTag: slug },
    authorPubkey: asHexPubkey(authorHex),
    blurb: fields.blurb ?? null,
    coverUrl: fields.coverUrl ?? null,
    purchaseUrl: fields.purchaseUrl ?? null,
    parentHeader: EDITS_HDR,
  };
  const unsigned = toBookAuthorOverlayEvent(o);
  const tags = [...unsigned.tags.map((t: readonly string[]) => [...t]), ["json", JSON.stringify(unsigned.payload)]];
  return { id: `${slug}-ovl-${authorHex.slice(0, 6)}-${createdAt}`, pubkey: authorHex, sig: "x", created_at: createdAt, kind: 39999, tags, content: "" } as unknown as SignedNostrEvent;
}

// A query routed by the #z concept of the filter.
function routedQuery(opts: {
  book?: SignedNostrEvent | null;
  claims?: SignedNostrEvent[];
  verified?: SignedNostrEvent[];
  overlays?: SignedNostrEvent[];
}): BooksDeps["query"] {
  return vi.fn(async (filter: Record<string, unknown>): Promise<SignedNostrEvent[]> => {
    const z = ((filter["#z"] as string[]) ?? [])[0] ?? "";
    if (z.endsWith("book-claims")) return opts.claims ?? [];
    if (z.endsWith("author-verified")) return opts.verified ?? [];
    if (z.endsWith("author-edits")) return opts.overlays ?? [];
    return opts.book === null ? [] : [opts.book ?? bookEvent("orbital", "Orbital")];
  });
}

// `over` is loosely typed: `BooksDeps` gains `trust` in the implementation (ADR
// 0033 §5), so the merged literal is cast through `unknown` to the real deps.
function makeApp(
  query: BooksDeps["query"],
  over: Record<string, unknown> = {},
  config: Config = cfg(),
) {
  const deps = { config, query, trust: fixtureTrust(), ...over } as unknown as BooksDeps;
  const app = express();
  app.use("/", buildBooksRouter(deps));
  return app;
}

// ── AC-6: exactly one verified claimant → overlay applied + attribution ──

describe("GET /api/books/:slug — single verified claimant applies the overlay (AC-6)", () => {
  it("applies the verified author's blurb/cover and lists them in authorProvided", async () => {
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", CUR2, AUTHOR, 1, 11),
      ],
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "The author's blurb.", coverUrl: "https://author.example/cover.jpg" }, 20)],
    });
    const res = await request(makeApp(query)).get("/api/books/orbital");
    expect(res.status).toBe(200);
    expect(res.body.book.blurb).toBe("The author's blurb.");
    expect(res.body.book.coverUrl).toBe("https://author.example/cover.jpg");
    expect(res.body.authorProvided.sort()).toEqual(["blurb", "coverUrl"].sort());
    const verified = res.body.claimants.find((c: { npub: string; verified?: boolean }) => c.npub === npubEncode(AUTHOR));
    expect(verified?.verified).toBe(true);
  });

  it("a cleared overlay field reverts to the canonical value (reversibility, AC-6)", async () => {
    // The author overlays only a cover; blurb is cleared (null) → canonical blurb renders.
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", CUR2, AUTHOR, 1, 11),
      ],
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: null, coverUrl: "https://author.example/cover.jpg" }, 20)],
    });
    const res = await request(makeApp(query)).get("/api/books/orbital");
    expect(res.status).toBe(200);
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB); // reverted
    expect(res.body.book.coverUrl).toBe("https://author.example/cover.jpg");
    expect(res.body.authorProvided).toEqual(["coverUrl"]);
  });

  it("fetches asserter weights in exactly ONE batched trust call (no N+1)", async () => {
    const trust = fixtureTrust();
    const spy = vi.spyOn(trust, "weights");
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", CUR2, AUTHOR, 1, 11),
      ],
      overlays: [],
    });
    await request(makeApp(query, { trust })).get("/api/books/orbital");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

// ── AC-6: a bare (unverified) claim never applies its overlay ──

describe("GET /api/books/:slug — a bare claim does NOT apply an overlay (AC-6 / AC-8)", () => {
  it("an unverified claimant's overlay is ignored; canonical renders; verified:false", async () => {
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [], // no verification assertions → not verified
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "Should be ignored." }, 20)],
    });
    const res = await request(makeApp(query)).get("/api/books/orbital");
    expect(res.status).toBe(200);
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB);
    expect(res.body.authorProvided).toEqual([]);
    const c = res.body.claimants.find((x: { npub: string; verified?: boolean }) => x.npub === npubEncode(AUTHOR));
    expect(c?.verified).toBe(false);
  });

  it("below-N verification (only 1 curator) does not apply the overlay", async () => {
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [verifiedEvent("orbital", CUR1, AUTHOR, 1, 10)], // 1 < N=2
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "Should be ignored." }, 20)],
    });
    const res = await request(makeApp(query)).get("/api/books/orbital");
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB);
    expect(res.body.authorProvided).toEqual([]);
  });
});

// ── AC-7: >1 verified claimant → none-on-conflict ──

describe("GET /api/books/:slug — multiple verified claimants resolve to none-on-conflict (AC-7)", () => {
  it("two verified claimants → NO overlay applied, ALL badged verified", async () => {
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR), claimEvent("orbital", AUTHOR2)],
      verified: [
        // AUTHOR cleared by CUR1+CUR2; AUTHOR2 cleared by CUR1+CUR2 too.
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", CUR2, AUTHOR, 1, 11),
        verifiedEvent("orbital", CUR1, AUTHOR2, 1, 12),
        verifiedEvent("orbital", CUR2, AUTHOR2, 1, 13),
      ],
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "Author one's blurb." }, 20)],
    });
    const res = await request(makeApp(query)).get("/api/books/orbital");
    expect(res.status).toBe(200);
    // No fabricated winner: canonical renders, no overlay.
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB);
    expect(res.body.authorProvided).toEqual([]);
    // Both claimants are badged verified.
    const verifiedNpubs = res.body.claimants
      .filter((c: { verified?: boolean }) => c.verified)
      .map((c: { npub: string }) => c.npub)
      .sort();
    expect(verifiedNpubs).toEqual([npubEncode(AUTHOR), npubEncode(AUTHOR2)].sort());
  });
});

// ── AC-2/AC-3: dispute + self-verify in the merge ──

describe("GET /api/books/:slug — dispute and self-verify in the read-merge (AC-2/AC-3)", () => {
  it("a curator's latest dispute drops the count below N → not verified, no overlay", async () => {
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", CUR2, AUTHOR, 1, 11),
        verifiedEvent("orbital", CUR2, AUTHOR, -1, 20), // CUR2 disputes (latest)
      ],
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "Ignored." }, 21)],
    });
    const res = await request(makeApp(query)).get("/api/books/orbital");
    expect(res.body.authorProvided).toEqual([]);
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB);
  });

  it("the author's own assertion does not count toward their own verification", async () => {
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", AUTHOR, AUTHOR, 1, 11), // self-verify, excluded
      ],
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "Ignored." }, 20)],
    });
    const res = await request(makeApp(query)).get("/api/books/orbital");
    // Only CUR1 counts → 1 < N=2 → not verified, no overlay.
    expect(res.body.authorProvided).toEqual([]);
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB);
  });
});

// ── AC-6/AC-8: canonical never mutated; honest degrade ──

describe("GET /api/books/:slug — canonical never mutated + honest degrade (AC-6/AC-8)", () => {
  it("never mutates the canonical record event tags (the API holds no librarian secret)", async () => {
    const canonical = bookEvent("orbital", "Orbital");
    const snapshot = JSON.stringify(canonical);
    const query = routedQuery({
      book: canonical,
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", CUR2, AUTHOR, 1, 11),
      ],
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "The author's blurb." }, 20)],
    });
    await request(makeApp(query)).get("/api/books/orbital");
    // The source canonical event object is untouched by the read-time compose.
    expect(JSON.stringify(canonical)).toBe(snapshot);
  });

  it("honest degrade (no house observer) → canonical renders, verified:false, no 500", async () => {
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", CUR2, AUTHOR, 1, 11),
      ],
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "Ignored under degrade." }, 20)],
    });
    const res = await request(
      makeApp(query, {}, cfg({ houseObserverPubkey: undefined })),
    ).get("/api/books/orbital");
    expect(res.status).toBe(200);
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB);
    expect(res.body.authorProvided).toEqual([]);
    const c = res.body.claimants[0];
    expect(c?.verified).toBe(false);
  });

  it("no trust provider → no verification, canonical renders, no 500", async () => {
    const query = routedQuery({
      book: bookEvent("orbital", "Orbital"),
      claims: [claimEvent("orbital", AUTHOR)],
      verified: [
        verifiedEvent("orbital", CUR1, AUTHOR, 1, 10),
        verifiedEvent("orbital", CUR2, AUTHOR, 1, 11),
      ],
      overlays: [overlayEvent("orbital", AUTHOR, { blurb: "Ignored." }, 20)],
    });
    const res = await request(makeApp(query, { trust: undefined })).get("/api/books/orbital");
    expect(res.status).toBe(200);
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB);
    expect(res.body.authorProvided).toEqual([]);
  });

  it("no claims → empty claimants, no overlay, canonical renders", async () => {
    const query = routedQuery({ book: bookEvent("orbital", "Orbital"), claims: [], verified: [], overlays: [] });
    const res = await request(makeApp(query)).get("/api/books/orbital");
    expect(res.status).toBe(200);
    expect(res.body.claimants).toEqual([]);
    expect(res.body.authorProvided).toEqual([]);
    expect(res.body.book.blurb).toBe(CANONICAL_BLURB);
  });
});
