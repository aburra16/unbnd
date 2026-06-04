// Collect-time dedup composition (Story 55 / ADR 0054 §3). Pure helper, no I/O.
//
// Two passes, in order:
//   1. Slug dedup (always applies): entries sharing a slug collapse into one,
//      merging their genre buckets. Slug is the record identity.
//   2. ISBN-13 collapse: two DIFFERENT slugs that share an isbn13 fold onto the
//      first-seen slug (genres merged), yielding one record for the same book
//      reached under two genre queries. A book with NO isbn13 is deduped by slug
//      only and is never dropped.

/** A candidate book with the genre bucket it was reached under. */
export type CollectedBook = {
  readonly slug: string;
  readonly isbn13?: string;
  readonly genre: string;
};

/** One logical book after dedup, with its merged genre buckets. */
export type DedupedBook = {
  readonly slug: string;
  readonly isbn13?: string;
  readonly genres: readonly string[];
};

type Acc = {
  slug: string;
  isbn13?: string;
  genres: Set<string>;
};

export function dedupBooks(collected: readonly CollectedBook[]): readonly DedupedBook[] {
  const bySlug = new Map<string, Acc>();
  // First isbn13 -> the slug that claimed it, so a later different slug folds in.
  const slugForIsbn = new Map<string, string>();

  for (const book of collected) {
    // Resolve the target slug: if this book's isbn13 was already claimed by a
    // different slug, fold this entry onto that first-seen slug.
    let targetSlug = book.slug;
    if (book.isbn13) {
      const owner = slugForIsbn.get(book.isbn13);
      if (owner !== undefined) {
        targetSlug = owner;
      } else {
        slugForIsbn.set(book.isbn13, book.slug);
      }
    }

    const existing = bySlug.get(targetSlug);
    if (existing) {
      existing.genres.add(book.genre);
      if (existing.isbn13 === undefined && book.isbn13) existing.isbn13 = book.isbn13;
    } else {
      bySlug.set(targetSlug, {
        slug: targetSlug,
        ...(book.isbn13 ? { isbn13: book.isbn13 } : {}),
        genres: new Set([book.genre]),
      });
    }
  }

  return [...bySlug.values()].map((acc) => ({
    slug: acc.slug,
    ...(acc.isbn13 ? { isbn13: acc.isbn13 } : {}),
    genres: [...acc.genres],
  }));
}
