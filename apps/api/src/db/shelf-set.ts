// The cached shelf rows read back into the shelf set the serve routes hydrate
// (ADR 0036 §3). Pure, so the mapping is testable without a database. Every
// kind the shelves worker writes is read here: trending, favorites, Hidden
// Gems (Story 71), Recently added (Story 105) and `genre:<slug>` rows.
import type { CachedShelfSet } from "../routes/homepage-shelves";

export type ShelfCacheRow = {
  readonly kind: string;
  readonly position: number;
  readonly bookSlug: string;
  readonly computedAt: Date | null;
};

const GENRE_KIND_PREFIX = "genre:";

/** Title-case a genre slug for display (e.g. "sci-fi" → "Sci Fi"). The cache
 * stores only slugs (ADR 0036 §2); the slug is the identity, the name cosmetic. */
function genreNameFromSlug(slug: string): string {
  return slug
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function shelfSetFromRows(rows: readonly ShelfCacheRow[]): Required<CachedShelfSet> {
  const set = { trending: [] as string[], favorites: [] as string[], hiddenGems: [] as string[], recent: [] as string[] };
  const byGenre = new Map<string, string[]>();
  let computedAt: Date | null = null;

  for (const r of [...rows].sort((a, b) => a.position - b.position)) {
    if (r.computedAt && (!computedAt || r.computedAt > computedAt)) computedAt = r.computedAt;
    if (r.kind === "trending") set.trending.push(r.bookSlug);
    else if (r.kind === "favorites") set.favorites.push(r.bookSlug);
    else if (r.kind === "hidden-gems") set.hiddenGems.push(r.bookSlug);
    else if (r.kind === "recent") set.recent.push(r.bookSlug);
    else if (r.kind.startsWith(GENRE_KIND_PREFIX)) {
      const slug = r.kind.slice(GENRE_KIND_PREFIX.length);
      const books = byGenre.get(slug) ?? [];
      books.push(r.bookSlug);
      byGenre.set(slug, books);
    }
  }

  return {
    computedAt: computedAt ? computedAt.toISOString() : null,
    ...set,
    genres: [...byGenre.entries()].map(([slug, books]) => ({ slug, name: genreNameFromSlug(slug), books })),
  };
}
