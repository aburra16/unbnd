// FAILING TESTS (red) — Story 60 (index-on-write), ADR 0059 §6 / Q5 (raw-
// consensus parity, "byte-identical" acceptance criterion).
//
// This locks the EXTRACTION: the batch builder `buildSearchDocuments` (which
// stays the full-rebuild source of truth) must be exactly equal to mapping the
// shared per-book `buildBookDocument` over each book with that book's own
// assertions — same docs, order-insensitive, same field values. One
// implementation, two callers (indexer batch + API/promoter incremental) can
// then never diverge.
//
// RED until the Implementer (a) extracts + exports `buildBookDocument` from
// @unbnd/search and (b) refactors `buildSearchDocuments` to map over it. The
// per-book helper is loaded opaquely (see _load-search.ts) so the missing export
// is an assertion-level "buildBookDocument is not a function", NOT a tsc wall.
// The existing apps/indexer/test/build-documents*.test.ts stay the regression
// proof and are NOT touched.
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
  fromBookTagAssertionEvent,
  fromWireEvent,
  toBookRecordEvent,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { SearchDocument } from "@unbnd/search";
import { buildSearchDocuments } from "../src/build-documents";
import { loadSearchModule } from "./_load-search";

const CURRENT_YEAR = 2026;
const LIB = asHexPubkey("1".repeat(63) + "a");
const BOOKS = buildBookRecordsHeaderAddress(LIB);
const TAGS = buildBookTagsHeaderAddress(LIB);
const ASSERTS = buildBookTagAssertionsHeaderAddress(LIB);

function bookEvent(slug: string, title: string): SignedNostrEvent {
  const rec: BookRecord = {
    slug,
    title,
    authorName: `Author of ${title}`,
    format: "reference",
    source: "openlibrary",
    parentHeader: BOOKS,
    subjects: ["fiction"],
    publishYear: 2000,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
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

/** Group assertion events by their parsed bookSlug (mirrors the per-book scope
 * the incremental path reads). */
function assertionsForBook(
  assertions: SignedNostrEvent[],
  slug: string,
): SignedNostrEvent[] {
  return assertions.filter((e) => {
    try {
      const a = fromBookTagAssertionEvent(
        fromWireEvent({ kind: e.kind, content: e.content, tags: e.tags }) as never,
      );
      return a.bookSlug === slug;
    } catch {
      return false;
    }
  });
}

const sortById = (docs: readonly SearchDocument[]) =>
  [...docs].sort((a, b) => a.id.localeCompare(b.id));

describe("raw-consensus parity: buildSearchDocuments == map(buildBookDocument) (ADR 0059 §6)", () => {
  it("the batch builder and the per-book helper produce the same docs for the same events", async () => {
    const { buildBookDocument } = await loadSearchModule();

    const books = [
      bookEvent("b1", "Alpha"),
      bookEvent("b2", "Beta"),
      bookEvent("b3", "Gamma"),
    ];
    const taxonomy = [
      taxEvent("mystery", "genre", "normal"),
      taxEvent("slow-burn", "style", "normal"),
      taxEvent("ai-generated", "signal", "accusatory"),
    ];
    const assertions = [
      // b1: mystery net-positive, ai-generated accusatory (must be hidden).
      assertionEvent(generateSecretKey(), "b1", "mystery", "genre", 1),
      assertionEvent(generateSecretKey(), "b1", "ai-generated", "signal", 1),
      // b2: slow-burn applied once, mystery applied then disputed → net 0 (drop).
      assertionEvent(generateSecretKey(), "b2", "slow-burn", "style", 1),
      assertionEvent(generateSecretKey(), "b2", "mystery", "genre", 1),
      assertionEvent(generateSecretKey(), "b2", "mystery", "genre", -1),
      // b3: no assertions.
    ];

    const batch = buildSearchDocuments(books, taxonomy, assertions, CURRENT_YEAR);
    const perBook = books
      .map((e) => {
        // The book record's `d` tag IS the slug (buildBookRecordDTag is identity).
        const slug = e.tags.find((t) => t[0] === "d")?.[1] ?? "";
        return buildBookDocument(
          e,
          taxonomy,
          assertionsForBook(assertions, slug),
          CURRENT_YEAR,
        );
      })
      .filter((d): d is SearchDocument => d !== null);

    expect(sortById(perBook)).toEqual(sortById(batch));
  });

  it("a junk book is dropped identically by both paths (no doc from either)", async () => {
    const { buildBookDocument } = await loadSearchModule();
    const books = [
      bookEvent("keep", "Real Book"),
      bookEvent("drop", "Summary of Dune"),
    ];
    const batch = buildSearchDocuments(books, [], [], CURRENT_YEAR);
    const perBook = books
      .map((e) => buildBookDocument(e, [], [], CURRENT_YEAR))
      .filter((d): d is SearchDocument => d !== null);
    expect(batch.map((d) => d.id).sort()).toEqual(["keep"]);
    expect(sortById(perBook)).toEqual(sortById(batch));
  });
});
