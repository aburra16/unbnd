// FAILING TESTS (red) — Story 60 (index-on-write), ADR 0059 §1 / §6, Q3 + Q5.
//
// The shared per-book builder `buildBookDocument` (extracted into @unbnd/search)
// produces ONE `SearchDocument | null` for a single book from its record event,
// the taxonomy, and THAT BOOK's assertion events, using the SAME RAW consensus
// rules as the batch builder (dedup by (author, book, tag) keep-latest, net
// polarity per (book, tag), drop net <= 0, drop accusatory sensitivity), and
// returns `null` when the record is junk (`isJunkRecord`). It is pure and takes
// `currentYear` injected — NO trust input exists in the signature (raw consensus
// is structurally enforced, CLAUDE.md invariant #3 / ADR 0035).
//
// Signature pinned from ADR 0059 §1:
//   buildBookDocument(
//     bookEvent, taxonomyEvents, assertionEventsForBook, currentYear
//   ): SearchDocument | null
//
// RED until the Implementer extracts + exports `buildBookDocument` from
// @unbnd/search. Loaded opaquely (see _load-search.ts) so the missing export is
// an assertion-level "buildBookDocument is not a function", NOT a tsc TS2305
// wall. Canonical home is packages/search/test/build-document.test.ts — see the
// _load-search.ts header for why it lives here RED today.
import { describe, expect, it } from "vitest";
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
} from "nostr-tools/pure";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  toBookRecordEvent,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { loadSearchModule } from "./_load-search";

const CURRENT_YEAR = 2026;
const LIB = asHexPubkey("1".repeat(63) + "a");
const BOOKS = buildBookRecordsHeaderAddress(LIB);
const TAGS = buildBookTagsHeaderAddress(LIB);
const ASSERTS = buildBookTagAssertionsHeaderAddress(LIB);

const load = () => loadSearchModule();

function bookEvent(over: Partial<BookRecord> & { slug: string }): SignedNostrEvent {
  const rec: BookRecord = {
    title: `Title of ${over.slug}`,
    authorName: `Author of ${over.slug}`,
    isbn13: "9780000000001",
    format: "reference",
    source: "openlibrary",
    parentHeader: BOOKS,
    subjects: ["fiction"],
    publishYear: 2000,
    ...over,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: over.slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

function taxEvent(
  slug: string,
  type: "genre" | "style" | "signal",
  sensitivity: "normal" | "accusatory",
): SignedNostrEvent {
  const t = toWireTemplate(
    toBookTagEvent({
      slug,
      type,
      name: slug.replace(/-/g, " "),
      sensitivity,
      parentHeader: TAGS,
    }),
    1,
  );
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

function assertionEvent(
  sk: Uint8Array,
  bookSlug: string,
  tagSlug: string,
  tagType: "genre" | "style" | "signal",
  polarity: 1 | -1,
): SignedNostrEvent {
  const a = {
    bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug,
    tagType,
    polarity,
    asserterPubkey: asHexPubkey(getPublicKey(sk)),
    parentHeader: ASSERTS,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), 2);
  return JSON.parse(JSON.stringify(finalizeEvent(t as never, sk))) as SignedNostrEvent;
}

describe("buildBookDocument — clean book + applied tags (ADR 0059 §1, AC: parity/raw)", () => {
  it("returns a SearchDocument carrying net-positive non-accusatory tags + genre slugs and the book's fields", async () => {
    const { buildBookDocument } = await load();
    const doc = buildBookDocument(
      bookEvent({ slug: "b1", title: "Alpha" }),
      [
        taxEvent("mystery", "genre", "normal"),
        taxEvent("slow-burn", "style", "normal"),
        taxEvent("ai-generated", "signal", "accusatory"),
      ],
      [
        assertionEvent(generateSecretKey(), "b1", "mystery", "genre", 1),
        assertionEvent(generateSecretKey(), "b1", "slow-burn", "style", 1),
        assertionEvent(generateSecretKey(), "b1", "ai-generated", "signal", 1),
      ],
      CURRENT_YEAR,
    );
    expect(doc).not.toBeNull();
    const d = doc!;
    expect(d.id).toBe("b1");
    expect(d.title).toBe("Alpha");
    expect(d.authorName).toBe("Author of b1");
    expect(d.isbn13).toBe("9780000000001");
    expect(d.format).toBe("reference");
    expect(d.publishYear).toBe(2000);
    // RAW consensus: net-positive non-accusatory tags surface by NAME.
    expect(d.tags).toContain("mystery");
    expect(d.tags).toContain("slow burn");
    // Accusatory excluded entirely.
    expect(d.tags).not.toContain("ai generated");
    // Only `type === "genre"` slugs feed genreSlugs.
    expect(d.genreSlugs).toEqual(["mystery"]);
  });
});

describe("buildBookDocument — dispute flips net polarity <= 0 (AC: dispute-flip, not append-only)", () => {
  it("drops a tag/genre whose disputes cancel its applies", async () => {
    const { buildBookDocument } = await load();
    const doc = buildBookDocument(
      bookEvent({ slug: "b1", title: "Alpha" }),
      [taxEvent("mystery", "genre", "normal")],
      [
        assertionEvent(generateSecretKey(), "b1", "mystery", "genre", 1),
        assertionEvent(generateSecretKey(), "b1", "mystery", "genre", -1),
      ],
      CURRENT_YEAR,
    );
    expect(doc).not.toBeNull();
    expect(doc!.tags).not.toContain("mystery");
    expect(doc!.genreSlugs).toEqual([]);
  });
});

describe("buildBookDocument — junk record (AC: junk never indexed on write)", () => {
  it("returns null for a denylist-title book (isJunkRecord true)", async () => {
    const { buildBookDocument } = await load();
    const doc = buildBookDocument(
      bookEvent({ slug: "junk", title: "Dune Boxed Set" }),
      [],
      [],
      CURRENT_YEAR,
    );
    expect(doc).toBeNull();
  });

  it("returns null for an out-of-range future publishYear (currentYear injected)", async () => {
    const { buildBookDocument } = await load();
    const doc = buildBookDocument(
      bookEvent({ slug: "future", publishYear: CURRENT_YEAR + 5 }),
      [],
      [],
      CURRENT_YEAR,
    );
    expect(doc).toBeNull();
  });
});

describe("buildBookDocument — a clean book with no assertions still builds (empty tags)", () => {
  it("returns a doc with empty tags/genreSlugs", async () => {
    const { buildBookDocument } = await load();
    const doc = buildBookDocument(
      bookEvent({ slug: "b2", title: "Beta" }),
      [],
      [],
      CURRENT_YEAR,
    );
    expect(doc).not.toBeNull();
    expect(doc!.id).toBe("b2");
    expect(doc!.tags).toEqual([]);
    expect(doc!.genreSlugs).toEqual([]);
  });
});
