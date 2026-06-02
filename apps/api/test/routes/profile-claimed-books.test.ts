// Failing tests (red) for Story 31 / ADR 0032 §2(b) — "Books by this author".
// A new author-scoped read GET /api/profile/:npub/claimed-books:
//   queryPaged({ kinds:[39999], "#z":[book-claims], authors:[hex] })  (cap-safe, ADR 0021)
//   → resolve each claim's `#a`/`#t` slug, dedupe
//   → hydrate via the existing `slugs` batch (deps.query) into ordered PublicBooks
//   → { books: PublicBook[] }; unresolvable slug skipped; zero claims → { books: [] }.
// Read by the PATH npub, never the viewer's session. Unresolvable npub → 404.
//
// Red until the new router (buildProfileClaimsRouter / the claimed-books endpoint
// on profile-stats) + the by-author read exist. Trust-INDEPENDENT: DI'd
// query/queryPaged, no trust input, no session needed for the public read.
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
import {
  buildProfileClaimsRouter,
  type ProfileClaimsDeps,
} from "../../src/routes/profile-claims";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR = buildBookRecordsHeaderAddress(LIB);
const CLAIMS_HDR: DListAddress<39998> = { kind: 39998, pubkey: LIB, dTag: "book-claims" };
const cfg = { librarianPubkey: LIB } as unknown as Config;

const AUTHOR_SK = generateSecretKey();
const AUTHOR_HEX = asHexPubkey(getPublicKey(AUTHOR_SK));
const AUTHOR_NPUB = npubEncode(AUTHOR_HEX);

function bookEvent(slug: string, title: string, createdAt = 1): SignedNostrEvent {
  const rec: BookRecord = {
    slug, title, authorName: `Author of ${title}`, format: "reference",
    source: "openlibrary", parentHeader: HDR, blurb: "x", publishYear: 2000,
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
  const tags = [...unsigned.tags.map((t) => [...t]), ["json", JSON.stringify(unsigned.payload)]];
  return { id: `${slug}-claim-${createdAt}`, pubkey: claimantHex, sig: "x", created_at: createdAt, kind: 39999, tags, content: "" } as unknown as SignedNostrEvent;
}

type Paged = { events: SignedNostrEvent[]; capped: boolean };

function makeApp(over: Partial<ProfileClaimsDeps> = {}) {
  const deps = {
    config: cfg,
    query: vi.fn(async () => []),
    queryPaged: vi.fn(async () => ({ events: [], capped: false }) as Paged),
    ...over,
  } as unknown as ProfileClaimsDeps;
  const app = express();
  app.use(express.json());
  app.use("/", buildProfileClaimsRouter(deps));
  return { app, deps };
}

describe("GET /api/profile/:npub/claimed-books — by-author read (AC-6)", () => {
  it("404 not_found when the npub segment is unresolvable", async () => {
    const { app } = makeApp();
    const res = await request(app).get("/api/profile/not-a-real-npub/claimed-books");
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("not_found");
  });

  it("returns the path author's claimed books, hydrated and in order", async () => {
    const queryPaged = vi.fn(async () => ({
      events: [
        claimEvent("ol-a", AUTHOR_HEX, 1),
        claimEvent("ol-b", AUTHOR_HEX, 2),
      ],
      capped: false,
    }));
    // The `slugs` batch hydrate (deps.query) returns the two catalog records.
    const query = vi.fn(async () => [bookEvent("ol-a", "Alpha"), bookEvent("ol-b", "Beta")]);
    const { app } = makeApp({ queryPaged, query });
    const res = await request(app).get(`/api/profile/${AUTHOR_NPUB}/claimed-books`);
    expect(res.status).toBe(200);
    expect(res.body.books.map((b: { slug: string }) => b.slug)).toEqual(["ol-a", "ol-b"]);
    expect(res.body.books[0].title).toBe("Alpha");
  });

  it("reads the claims author-scoped to the PATH npub (not a session)", async () => {
    const queryPaged = vi.fn(async () => ({ events: [claimEvent("ol-a", AUTHOR_HEX)], capped: false }));
    const query = vi.fn(async () => [bookEvent("ol-a", "Alpha")]);
    const { app } = makeApp({ queryPaged, query });
    await request(app).get(`/api/profile/${AUTHOR_NPUB}/claimed-books`);
    const call = queryPaged.mock.calls[0]?.[0] as Record<string, unknown> | undefined;
    expect(call).toBeDefined();
    expect(call!.authors).toEqual([AUTHOR_HEX]);
    expect((call!["#z"] as string[])[0]).toBe(`39998:${LIB}:book-claims`);
    expect(call!.kinds).toContain(39999);
  });

  it("skips a claim whose catalog book is missing (unresolvable slug drops)", async () => {
    const queryPaged = vi.fn(async () => ({
      events: [claimEvent("ol-a", AUTHOR_HEX, 1), claimEvent("ol-gone", AUTHOR_HEX, 2)],
      capped: false,
    }));
    // Only ol-a resolves in the batch hydrate; ol-gone is absent.
    const query = vi.fn(async () => [bookEvent("ol-a", "Alpha")]);
    const { app } = makeApp({ queryPaged, query });
    const res = await request(app).get(`/api/profile/${AUTHOR_NPUB}/claimed-books`);
    expect(res.status).toBe(200);
    expect(res.body.books.map((b: { slug: string }) => b.slug)).toEqual(["ol-a"]);
  });

  it("returns { books: [] } for an author with no claims (honest empty → section absent)", async () => {
    const queryPaged = vi.fn(async () => ({ events: [], capped: false }));
    const { app } = makeApp({ queryPaged });
    const res = await request(app).get(`/api/profile/${AUTHOR_NPUB}/claimed-books`);
    expect(res.status).toBe(200);
    expect(res.body.books).toEqual([]);
  });

  it("uses the paginating read (queryPaged), so an over-cap author is cap-safe", async () => {
    const queryPaged = vi.fn(async () => ({ events: [claimEvent("ol-a", AUTHOR_HEX)], capped: false }));
    const query = vi.fn(async () => [bookEvent("ol-a", "Alpha")]);
    const { app } = makeApp({ queryPaged, query });
    await request(app).get(`/api/profile/${AUTHOR_NPUB}/claimed-books`);
    expect(queryPaged.mock.calls.length).toBeGreaterThan(0);
  });
});
