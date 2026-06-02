// The homepage_shelves cache writer (ADR 0036 §2). Plain `postgres` (no drizzle
// in the worker, like apps/promoter/src/queue.ts). `replaceShelves` does a full
// REPLACE per refresh inside ONE transaction: delete the observer's rows, insert
// the new ordered set, all sharing one `computed_at`. A refresh is atomic — a
// Reader (via the serve API) never sees a half-written shelf set. An empty shelf
// writes zero rows for that kind (honest empty by absence).
import postgres from "postgres";
import type { ReplaceShelvesFn, ShelfSet, ShelvesCache } from "./compute";

type Row = {
  observer_hex: string;
  kind: string;
  position: number;
  book_slug: string;
};

/** Flatten a ShelfSet into ordered cache rows (kind/position/slug per shelf). */
function toRows(observerHex: string, shelves: ShelfSet): Row[] {
  const rows: Row[] = [];
  shelves.trending.forEach((r, i) =>
    rows.push({ observer_hex: observerHex, kind: "trending", position: i, book_slug: r.bookSlug }),
  );
  shelves.favorites.forEach((r, i) =>
    rows.push({ observer_hex: observerHex, kind: "favorites", position: i, book_slug: r.bookSlug }),
  );
  for (const g of shelves.genres) {
    g.books.forEach((r, i) =>
      rows.push({
        observer_hex: observerHex,
        kind: `genre:${g.slug}`,
        position: i,
        book_slug: r.bookSlug,
      }),
    );
  }
  return rows;
}

export type ShelvesCacheHandle = ShelvesCache & {
  close: () => Promise<void>;
};

export function createShelvesCache(databaseUrl: string): ShelvesCacheHandle {
  const sql = postgres(databaseUrl, { max: 1 });

  // The seam records each (observerHex, shelves) write — a cheap observability
  // hook (the `mock.calls` member of the seam type); production never reads it.
  const calls: Array<readonly [string, ShelfSet]> = [];
  const replaceShelves = (async (observerHex: string, shelves: ShelfSet): Promise<void> => {
    calls.push([observerHex, shelves]);
    const rows = toRows(observerHex, shelves);
    await sql.begin(async (tx) => {
      await tx`DELETE FROM homepage_shelves WHERE observer_hex = ${observerHex}`;
      if (rows.length > 0) {
        await tx`INSERT INTO homepage_shelves ${tx(rows, "observer_hex", "kind", "position", "book_slug")}`;
      }
    });
  }) as ReplaceShelvesFn & { mock: { calls: Array<readonly [string, ShelfSet]> } };
  Object.defineProperty(replaceShelves, "mock", { value: { calls }, enumerable: false });

  return {
    replaceShelves,
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}
