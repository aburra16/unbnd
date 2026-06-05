// Failing tests for Story 55 (catalog expansion), per ADR 0054 §3 "Dedup
// composition".
//
// The ADR composes dedup at collect time in index.ts: (1) slug dedup first
// (always applies, keyed by deriveSlug(doc.key)), then (2) an ISBN-13 collapse
// that folds two DIFFERENT slugs sharing the same isbn13 onto the first-seen
// slug (merging their genre buckets). A doc with NO isbn13 falls back to
// slug-only dedup (kept, never dropped).
//
// The ADR pins this as inline Map logic, not an exported function — so the
// collapse contract is tested through a small pure collection helper. The
// name `dedupBooks` is the Tester's pin for that contract (see the test-plan's
// "ADR ambiguity" note); the Implementer may extract the inline index.ts logic
// into this helper to satisfy it, keeping the behavior pure and unit-testable.
//
// The module apps/seeder/src/dedup.ts does not exist yet; it is loaded via the
// opaque specifier (see _load.ts) so the missing module is an assertion-level
// red, not a tsc compile wall.
import { describe, expect, it } from "vitest";
import { loadSeederModule } from "./_load";

// A collected entry before dedup: a candidate book with the genre bucket it was
// reached under, plus its selected isbn13 (or undefined when none).
type CollectedBook = {
  readonly slug: string;
  readonly isbn13?: string;
  readonly genre: string;
};

// The deduped result: one entry per logical book, with merged genre buckets.
type DedupedBook = {
  readonly slug: string;
  readonly isbn13?: string;
  readonly genres: readonly string[];
};

type DedupModule = {
  dedupBooks: (collected: readonly CollectedBook[]) => readonly DedupedBook[];
};

const load = () => loadSeederModule<DedupModule>("dedup");

const sorted = (xs: readonly string[]) => [...xs].sort();

describe("dedupBooks — slug dedup (always applies)", () => {
  it("collapses the same slug reached under two genres into one record with merged genres", async () => {
    const { dedupBooks } = await load();
    const out = dedupBooks([
      { slug: "ol-a", isbn13: "9780000000001", genre: "fantasy" },
      { slug: "ol-a", isbn13: "9780000000001", genre: "thriller" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.slug).toBe("ol-a");
    expect(sorted(out[0]!.genres)).toEqual(["fantasy", "thriller"]);
  });
});

describe("dedupBooks — ISBN-13 collapse (two slugs, same book)", () => {
  it("collapses two DIFFERENT slugs sharing an isbn13 onto the first-seen slug, merging genres", async () => {
    const { dedupBooks } = await load();
    const out = dedupBooks([
      { slug: "ol-a", isbn13: "9780743273565", genre: "fantasy" },
      { slug: "ol-b", isbn13: "9780743273565", genre: "mystery" },
    ]);
    expect(out).toHaveLength(1);
    // First-seen slug wins (slug dedup is the identity; isbn13 only collapses).
    expect(out[0]!.slug).toBe("ol-a");
    expect(sorted(out[0]!.genres)).toEqual(["fantasy", "mystery"]);
  });
});

describe("dedupBooks — no-ISBN fallback (slug-only, never dropped)", () => {
  it("keeps two distinct slugs that both lack an isbn13 (no false collapse)", async () => {
    const { dedupBooks } = await load();
    const out = dedupBooks([
      { slug: "ol-a", genre: "fantasy" },
      { slug: "ol-b", genre: "mystery" },
    ]);
    expect(out).toHaveLength(2);
    expect(sorted(out.map((b) => b.slug))).toEqual(["ol-a", "ol-b"]);
  });

  it("keeps a no-isbn book alongside an isbn'd one (no-isbn is not dropped)", async () => {
    const { dedupBooks } = await load();
    const out = dedupBooks([
      { slug: "ol-a", isbn13: "9780743273565", genre: "fantasy" },
      { slug: "ol-b", genre: "mystery" },
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("dedupBooks — does not over-collapse distinct books", () => {
  it("keeps two slugs with DIFFERENT isbn13 as two records", async () => {
    const { dedupBooks } = await load();
    const out = dedupBooks([
      { slug: "ol-a", isbn13: "9780000000001", genre: "fantasy" },
      { slug: "ol-b", isbn13: "9780000000002", genre: "mystery" },
    ]);
    expect(out).toHaveLength(2);
  });
});
