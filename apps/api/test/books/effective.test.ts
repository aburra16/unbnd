// Failing tests for Story 56 (catalog prune via read-time filter), per ADR 0055 §3.
//
// parseBook (apps/api/src/books/effective.ts) is the SINGLE choke point for the
// API read-path filter: every direct-relay book surface funnels through it and
// already drops its nulls. After fromBookRecordEvent yields the record, parseBook
// must return `null` when isJunkRecord(record, currentYear) is true, BEFORE
// projecting to PublicBook. A clean record still parses to a PublicBook.
//
// `currentYear` is injected into parseBook as a DEFAULTED parameter
// (new Date().getUTCFullYear(), overridable in tests) so it stays pure and
// deterministic (ADR 0055 §3). These tests pass `currentYear` as the 2nd arg;
// parseBook today takes one arg, so the new param must be optional/defaulted.
//
// Events are built with the real @unbnd/schemas builders so the wire shapes are
// genuine. RED today: parseBook does not yet filter junk. The Implementer turns
// these green.
//
// parseBook is loaded through the opaque specifier loader (_load.ts) with a
// widened (currentYear-accepting) local type, so passing the 2nd arg is NOT a
// tsc TS2554 arity wall — the REAL function runs and the reds are assertion-level
// ("expected null"). See ADR 0055 §3.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { PublicBook } from "../../src/books/effective";
import { loadApiModule } from "./_load";

// The decided (widened) parseBook contract — ADR 0055 §3. Loaded by an opaque
// specifier so the not-yet-present `currentYear` param is invisible to tsc.
type EffectiveModule = {
  parseBook: (event: SignedNostrEvent, currentYear?: number) => PublicBook | null;
};
const load = () => loadApiModule<EffectiveModule>("books/effective");

const CURRENT_YEAR = 2026;
const LIB = asHexPubkey("1".repeat(63) + "a");
const HDR = buildBookRecordsHeaderAddress(LIB);

/** A complete, clean record by default; override fields to make it junk. */
function bookEvent(over: Partial<BookRecord> & { slug: string }): SignedNostrEvent {
  const rec: BookRecord = {
    title: `Title of ${over.slug}`,
    authorName: `Author of ${over.slug}`,
    coverUrl: "https://covers.openlibrary.org/b/id/123-L.jpg",
    format: "reference",
    source: "openlibrary",
    parentHeader: HDR,
    blurb: "x",
    publishYear: 2000,
    ...over,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: over.slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

describe("parseBook — clean records parse to a PublicBook", () => {
  it("returns a PublicBook for a clean, complete record", async () => {
    const { parseBook } = await load();
    const book = parseBook(bookEvent({ slug: "clean", title: "A Clean Book" }), CURRENT_YEAR);
    expect(book).not.toBeNull();
    expect(book?.slug).toBe("clean");
    expect(book?.title).toBe("A Clean Book");
  });
});

describe("parseBook — returns null for junk (Story 56, ADR 0055 §3)", () => {
  it("returns null for a junk-denylist title (so /api/books/:slug 404s)", async () => {
    const { parseBook } = await load();
    expect(parseBook(bookEvent({ slug: "j1", title: "Summary of Dune" }), CURRENT_YEAR)).toBeNull();
  });

  it("returns null for a record with a publishYear after currentYear", async () => {
    const { parseBook } = await load();
    expect(
      parseBook(bookEvent({ slug: "future", publishYear: CURRENT_YEAR + 1 }), CURRENT_YEAR),
    ).toBeNull();
  });

  it("returns null for a record with a publishYear before 1800", async () => {
    const { parseBook } = await load();
    expect(parseBook(bookEvent({ slug: "ancient", publishYear: 1700 }), CURRENT_YEAR)).toBeNull();
  });
});

describe("parseBook — conservative: a plausible legacy record still parses", () => {
  it("returns a PublicBook for a record that merely lacks year/language/pages", async () => {
    const { parseBook } = await load();
    const rec: BookRecord = {
      slug: "legacy",
      title: "A Legitimate Legacy Book",
      authorName: "Some Author",
      coverUrl: "https://covers.openlibrary.org/b/id/123-L.jpg",
      format: "reference",
      source: "openlibrary",
      parentHeader: HDR,
      // no publishYear, no language, no pageCount — predates enrichment
    };
    const t = toWireTemplate(toBookRecordEvent(rec), 1);
    const e = { id: "legacy", pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
    const book = parseBook(e, CURRENT_YEAR);
    expect(book).not.toBeNull();
    expect(book?.slug).toBe("legacy");
  });

  // Refinement 2026-06-05 (ADR 0055 §1): cover is NOT a read-time junk signal.
  // parseBook is the choke point for community submissions and author overlays
  // where coverUrl is OPTIONAL legitimate content (it renders with the gradient
  // fallback), so a cover-less but otherwise-clean record must parse, not return
  // null.
  it("returns a PublicBook for a record missing a cover (cover is not a junk signal)", async () => {
    const { parseBook } = await load();
    const rec: BookRecord = {
      slug: "no-cover",
      title: "Cover-less Book",
      authorName: "Some Author",
      format: "reference",
      source: "openlibrary",
      parentHeader: HDR,
      blurb: "x",
      publishYear: 2000,
      // coverUrl intentionally omitted
    };
    const t = toWireTemplate(toBookRecordEvent(rec), 1);
    const e = { id: "no-cover", pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
    const book = parseBook(e, CURRENT_YEAR);
    expect(book).not.toBeNull();
    expect(book?.slug).toBe("no-cover");
  });
});
