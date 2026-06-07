// Shelf-definition envs (Story 35 / ADR 0036 §4), validated in the WORKER (not
// the API). All four are positive integers; a bad env fails the run LOUDLY
// rather than caching a malformed shelf. Defaults: 7 / 3 / 5 / 10.
//   SHELF_TRENDING_WINDOW_DAYS — the Trending activity window (default 7, §2.9).
//   SHELF_FAVORITES_MIN_RATINGS — the min trusted-rating count to qualify for
//     Community Favorites (default 3), so thinly-rated books are excluded.
//   SHELF_GENRE_COUNT — how many genre rows surface on the homepage (default 5).
//   SHELF_BOOKS_PER_ROW — books per row, caps every shelf (default 10).
export type ShelfDefs = {
  readonly trendingWindowDays: number;
  readonly favoritesMinRatings: number;
  readonly genreCount: number;
  readonly booksPerRow: number;
  // Story 71 / ADR 0069: the minimum positive hype-gap (trusted average above the
  // crowd's raw average) a book needs to qualify for the Hidden Gems shelf.
  readonly hiddenGemsMargin: number;
};

function positiveFloat(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`shelves: ${name} must be a positive number; got ${JSON.stringify(raw)}`);
  }
  return n;
}

function positiveInt(env: Record<string, string | undefined>, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(
      `shelves: ${name} must be a positive integer; got ${JSON.stringify(raw)}`,
    );
  }
  return n;
}

export function loadShelfDefs(
  env: Record<string, string | undefined> = process.env,
): ShelfDefs {
  return {
    trendingWindowDays: positiveInt(env, "SHELF_TRENDING_WINDOW_DAYS", 7),
    favoritesMinRatings: positiveInt(env, "SHELF_FAVORITES_MIN_RATINGS", 3),
    genreCount: positiveInt(env, "SHELF_GENRE_COUNT", 5),
    booksPerRow: positiveInt(env, "SHELF_BOOKS_PER_ROW", 10),
    hiddenGemsMargin: positiveFloat(env, "HIDDEN_GEMS_MARGIN", 0.5),
  };
}
