// Failing tests for Story 56 (catalog prune via read-time filter), per ADR 0055 §2.
//
// The indexer build site (apps/indexer/src/build-documents.ts buildSearchDocuments)
// must SKIP any stored record for which the shared `isJunkRecord` oracle is true,
// after the existing parse guard, so junk is never indexed → absent from
// /api/search and genre browse. A clean record is still indexed.
//
// `currentYear` is threaded into buildSearchDocuments from its caller (index.ts,
// new Date().getUTCFullYear()) so the build stays pure and the test pins a year
// (ADR 0055 §2). These tests pass `currentYear` as the 4th argument; the existing
// build-documents.test.ts calls the 3-arg form, so the new param must be
// OPTIONAL/defaulted (interpretation flagged in the test plan).
//
// RED today: buildSearchDocuments does not yet skip junk (a denylist title and a
// cover-less record are currently indexed). The Implementer turns these green.
//
// buildSearchDocuments is loaded through the opaque specifier loader (_load.ts)
// with a widened (4-arg, currentYear-accepting) local type, so passing the 4th
// arg is NOT a tsc TS2554 arity wall — the REAL function runs and the reds are
// assertion-level ("expected [...] to not include 'junk'"). See ADR 0055 §2.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { SearchDocument } from "@unbnd/search";
import { loadIndexerModule } from "./_load";

// The decided (widened) buildSearchDocuments contract — ADR 0055 §2 threads
// `currentYear` in as the 4th argument. Loaded opaquely so the not-yet-present
// param is invisible to tsc.
type BuildModule = {
  buildSearchDocuments: (
    bookEvents: SignedNostrEvent[],
    taxonomyEvents: SignedNostrEvent[],
    assertionEvents: SignedNostrEvent[],
    currentYear?: number,
  ) => SearchDocument[];
};
const load = () => loadIndexerModule<BuildModule>("build-documents");

const CURRENT_YEAR = 2026;
const LIB = asHexPubkey("1".repeat(63) + "a");
const BOOKS = buildBookRecordsHeaderAddress(LIB);

/** A complete, clean record by default; override any field to make it junk. */
function bookEvent(over: Partial<BookRecord> & { slug: string }): SignedNostrEvent {
  const rec: BookRecord = {
    title: `Title of ${over.slug}`,
    authorName: `Author of ${over.slug}`,
    coverUrl: "https://covers.openlibrary.org/b/id/123-L.jpg",
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

describe("buildSearchDocuments — skips junk records (Story 56, ADR 0055 §2)", () => {
  it("includes a clean record in the output documents", async () => {
    const { buildSearchDocuments } = await load();
    const docs = buildSearchDocuments(
      [bookEvent({ slug: "clean", title: "A Clean Book" })],
      [],
      [],
      CURRENT_YEAR,
    );
    expect(docs.map((d) => d.id)).toContain("clean");
  });

  it("excludes a record with a junk-denylist title", async () => {
    const { buildSearchDocuments } = await load();
    const docs = buildSearchDocuments(
      [bookEvent({ slug: "junk-title", title: "Dune Boxed Set" })],
      [],
      [],
      CURRENT_YEAR,
    );
    expect(docs.map((d) => d.id)).not.toContain("junk-title");
  });

  // Refinement 2026-06-05 (ADR 0055 §1): cover is NOT a junk signal. A cover-less
  // but otherwise-clean record is legitimate content and is STILL indexed (it
  // renders with the gradient fallback rather than being hidden).
  it("indexes a record with a missing cover (cover is not a junk signal)", async () => {
    const { buildSearchDocuments } = await load();
    // Build a clean event, then strip the cover tag/payload to simulate a stored
    // cover-less record (an explicit absent coverUrl).
    const rec: BookRecord = {
      slug: "no-cover",
      title: "Cover-less Book",
      authorName: "Some Author",
      format: "reference",
      source: "openlibrary",
      parentHeader: BOOKS,
      subjects: ["fiction"],
      publishYear: 2000,
      // coverUrl intentionally omitted
    };
    const t = toWireTemplate(toBookRecordEvent(rec), 1);
    const e = { id: "no-cover", pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
    const docs = buildSearchDocuments([e], [], [], CURRENT_YEAR);
    expect(docs.map((d) => d.id)).toContain("no-cover");
  });

  it("excludes a record with an out-of-range publishYear (> currentYear)", async () => {
    const { buildSearchDocuments } = await load();
    const docs = buildSearchDocuments(
      [bookEvent({ slug: "future-year", publishYear: CURRENT_YEAR + 5 })],
      [],
      [],
      CURRENT_YEAR,
    );
    expect(docs.map((d) => d.id)).not.toContain("future-year");
  });

  it("indexes clean records and drops junk in a mixed batch", async () => {
    const { buildSearchDocuments } = await load();
    const docs = buildSearchDocuments(
      [
        bookEvent({ slug: "keep-1", title: "Real Book One" }),
        bookEvent({ slug: "drop-summary", title: "Summary of Dune" }),
        bookEvent({ slug: "keep-2", title: "Real Book Two" }),
      ],
      [],
      [],
      CURRENT_YEAR,
    );
    const ids = docs.map((d) => d.id);
    expect(ids).toContain("keep-1");
    expect(ids).toContain("keep-2");
    expect(ids).not.toContain("drop-summary");
  });
});
