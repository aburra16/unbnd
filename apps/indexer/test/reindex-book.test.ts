// FAILING TESTS (red) — Story 60 (index-on-write), ADR 0059 §2 + §7, Q6. The
// shared best-effort "reindex this book" helper that BOTH the API tags hook and
// the promoter hook call. It does scoped read → buildBookDocument → upsert, and
// NEVER throws to its caller (best-effort, mirrors withUpSync):
//
//   reindexBook(provider, read, bookSlug, currentYear): Promise<void>
//     - read(slug) → { bookEvent, taxonomyEvents, assertionEvents }
//     - buildBookDocument(bookEvent, taxonomyEvents, assertionEvents, year)
//     - if doc !== null → provider.index([doc]); else skip (Q6: junk/demoted →
//       no upsert AND no delete — the provider has no single-doc delete)
//     - any error (read throws / provider.index rejects) is logged + swallowed
//
// SEAM PINNED FROM ADR 0059 §2 (flag for the Implementer): `reindexBook` and the
// `BookReader` type are exported from @unbnd/search (Implementation notes §2).
// Loaded opaquely (mirrors _load-search.ts) so the missing exports are an
// assertion-level "reindexBook is not a function", NOT a tsc TS2305 wall. This
// covers the HOW the API/promoter route tests delegate to (those only assert the
// trigger decision).
//
// RED until the Implementer extracts + exports `reindexBook` + `BookReader` from
// @unbnd/search. Hosted in apps/indexer/test because @unbnd/schemas does not yet
// resolve from packages/search (the dep edge ADR 0059 adds); canonical home is
// packages/search/test/reindex-book.test.ts once that dep lands.
import { describe, expect, it, vi } from "vitest";
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
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import type { SearchDocument, SearchProvider } from "@unbnd/search";

const CURRENT_YEAR = 2026;
const LIB = asHexPubkey("1".repeat(63) + "a");
const BOOKS = buildBookRecordsHeaderAddress(LIB);
const TAGS = buildBookTagsHeaderAddress(LIB);
const ASSERTS = buildBookTagAssertionsHeaderAddress(LIB);

// --- opaque loader for the not-yet-present @unbnd/search exports -------------
type BookReader = (bookSlug: string) => Promise<{
  bookEvent: SignedNostrEvent | null;
  taxonomyEvents: SignedNostrEvent[];
  assertionEvents: SignedNostrEvent[];
}>;
type ReindexModule = {
  reindexBook: (
    provider: SearchProvider,
    read: BookReader,
    bookSlug: string,
    currentYear: number,
  ) => Promise<void>;
};
async function loadReindex(): Promise<ReindexModule> {
  const spec = "@unbnd/search";
  return (await import(/* @vite-ignore */ spec)) as ReindexModule;
}

// --- fixtures ---------------------------------------------------------------
function bookEvent(over: Partial<BookRecord> & { slug: string }): SignedNostrEvent {
  const rec: BookRecord = {
    title: `Title of ${over.slug}`,
    authorName: `Author of ${over.slug}`,
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
function taxEvent(slug: string): SignedNostrEvent {
  const t = toWireTemplate(
    toBookTagEvent({ slug, type: "genre", name: slug, sensitivity: "normal", parentHeader: TAGS }),
    1,
  );
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}
function assertionEvent(bookSlug: string, tagSlug: string): SignedNostrEvent {
  const sk = generateSecretKey();
  const a = {
    bookSlug,
    bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug,
    tagType: "genre" as const,
    polarity: 1 as const,
    asserterPubkey: asHexPubkey(getPublicKey(sk)),
    parentHeader: ASSERTS,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), 2);
  return JSON.parse(JSON.stringify(finalizeEvent(t as never, sk))) as SignedNostrEvent;
}

/** A minimal fake provider that records `index` upserts. */
function fakeProvider(over: Partial<SearchProvider> = {}): SearchProvider {
  return {
    name: "meili",
    health: vi.fn(async () => ({ ok: true as const, provider: "meili" as const })),
    configureIndex: vi.fn(async () => {}),
    index: vi.fn(async (_docs: readonly SearchDocument[]) => {}),
    deleteAll: vi.fn(async () => {}),
    search: vi.fn(async () => ({ hits: [], total: 0, offset: 0, limit: 0 })),
    ...over,
  };
}

describe("reindexBook — happy path (ADR 0059 §2, AC: single-doc upsert)", () => {
  it("reads the book, builds the doc, and upserts exactly one doc through provider.index", async () => {
    const { reindexBook } = await loadReindex();
    const provider = fakeProvider();
    const read: BookReader = vi.fn(async () => ({
      bookEvent: bookEvent({ slug: "b1", title: "Alpha" }),
      taxonomyEvents: [taxEvent("mystery")],
      assertionEvents: [assertionEvent("b1", "mystery")],
    }));

    await reindexBook(provider, read, "b1", CURRENT_YEAR);

    expect(read).toHaveBeenCalledWith("b1");
    expect(provider.index).toHaveBeenCalledTimes(1);
    const docs = (provider.index as ReturnType<typeof vi.fn>).mock.calls[0]![0] as SearchDocument[];
    expect(docs).toHaveLength(1);
    expect(docs[0]!.id).toBe("b1");
    expect(docs[0]!.genreSlugs).toEqual(["mystery"]);
    expect(provider.deleteAll).not.toHaveBeenCalled(); // never the batch flush
  });
});

describe("reindexBook — junk/demoted → skip (ADR 0059 Q6: no upsert, no delete)", () => {
  it("a junk record (buildBookDocument null) issues NO index upsert and NO delete", async () => {
    const { reindexBook } = await loadReindex();
    const provider = fakeProvider();
    const read: BookReader = vi.fn(async () => ({
      bookEvent: bookEvent({ slug: "junk", title: "Dune Boxed Set" }), // denylist title
      taxonomyEvents: [],
      assertionEvents: [],
    }));

    await reindexBook(provider, read, "junk", CURRENT_YEAR);

    expect(provider.index).not.toHaveBeenCalled();
    expect(provider.deleteAll).not.toHaveBeenCalled();
  });

  it("a missing book (bookEvent null) issues NO index upsert", async () => {
    const { reindexBook } = await loadReindex();
    const provider = fakeProvider();
    const read: BookReader = vi.fn(async () => ({
      bookEvent: null,
      taxonomyEvents: [],
      assertionEvents: [],
    }));

    await reindexBook(provider, read, "ghost", CURRENT_YEAR);
    expect(provider.index).not.toHaveBeenCalled();
  });
});

describe("reindexBook — best-effort: errors are swallowed (ADR 0059 §7)", () => {
  it("a provider.index rejection does not throw to the caller", async () => {
    const { reindexBook } = await loadReindex();
    const provider = fakeProvider({
      index: vi.fn(async () => {
        throw new Error("provider down");
      }),
    });
    const read: BookReader = vi.fn(async () => ({
      bookEvent: bookEvent({ slug: "b1", title: "Alpha" }),
      taxonomyEvents: [],
      assertionEvents: [],
    }));

    await expect(reindexBook(provider, read, "b1", CURRENT_YEAR)).resolves.toBeUndefined();
  });

  it("a read failure does not throw to the caller and issues no upsert", async () => {
    const { reindexBook } = await loadReindex();
    const provider = fakeProvider();
    const read: BookReader = vi.fn(async () => {
      throw new Error("relay timeout");
    });

    await expect(reindexBook(provider, read, "b1", CURRENT_YEAR)).resolves.toBeUndefined();
    expect(provider.index).not.toHaveBeenCalled();
  });
});
