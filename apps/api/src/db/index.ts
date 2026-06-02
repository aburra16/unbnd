// Postgres client + Drizzle adapter per ADR 0003.
import { eq, inArray } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { homepageShelves, promotions } from "./schema";
import { migrations } from "./migrations";
import type { CachedShelfSet } from "../routes/homepage-shelves";

/** The promotion job lifecycle states (ADR 0031 §1). */
export type PromotionStatus = "pending" | "promoting" | "done" | "failed";

export type DbClient = PostgresJsDatabase<typeof schema>;

/** The transaction handle passed to a `db.transaction(async (tx) => ...)` callback. */
export type DbTx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

/** Anything you can run a query on — the full client or a live transaction. */
export type DbOrTx = DbClient | DbTx;

let _db: DbClient | null = null;

/**
 * Module-level db handle. Forwards to the client created by `createDb`.
 * Using it before initialization throws, so a missing wire-up fails loudly.
 */
export const db: DbClient = new Proxy({} as DbClient, {
  get(_target, prop) {
    if (!_db) {
      throw new Error(
        "db not initialized — call createDb(databaseUrl) at startup",
      );
    }
    const value = Reflect.get(_db as object, prop);
    return typeof value === "function" ? value.bind(_db) : value;
  },
});

export function createDb(databaseUrl: string): DbClient {
  const client = postgres(databaseUrl);
  _db = drizzle(client, { schema });
  return _db;
}

/**
 * Batched read of promotion job states for the given slugs (ADR 0031 §3b). ONE
 * query (`WHERE slug = ANY($1)`), never N per-row reads. Returns a
 * `Map<slug, status>` with only the slugs that have a `promotions` row — an
 * absent slug (never enqueued) is simply not in the map (the caller reads `null`).
 * Empty input short-circuits to an empty map (no query). Mirrors how
 * `enqueuePromotion` wraps the `promotions` table.
 */
export async function readPromotionStatuses(
  slugs: string[],
): Promise<Map<string, PromotionStatus>> {
  const result = new Map<string, PromotionStatus>();
  if (slugs.length === 0) return result;
  const rows = await db
    .select({ slug: promotions.slug, status: promotions.status })
    .from(promotions)
    .where(inArray(promotions.slug, slugs));
  for (const row of rows) {
    result.set(row.slug, row.status as PromotionStatus);
  }
  return result;
}

/** Run all embedded migrations in order. Idempotent (IF NOT EXISTS guards). */
export async function runMigrations(databaseUrl: string): Promise<void> {
  const client = postgres(databaseUrl, { max: 1 });
  try {
    for (const migration of migrations) {
      await client.unsafe(migration.sql);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

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

/**
 * Read the homepage trust-shelf cache for one observer (ADR 0036 §3). Groups the
 * `homepage_shelves` rows by `kind`, ordered by `position`, into the ordered-slug
 * `CachedShelfSet` the serve route hydrates. Honest empty when the observer has
 * no rows (`computedAt: null`). Genre rows carry `kind = 'genre:<slug>'`.
 */
export async function readShelfCache(observerHex: string): Promise<CachedShelfSet> {
  const rows = await db
    .select({
      kind: homepageShelves.kind,
      position: homepageShelves.position,
      bookSlug: homepageShelves.bookSlug,
      computedAt: homepageShelves.computedAt,
    })
    .from(homepageShelves)
    .where(eq(homepageShelves.observerHex, observerHex));

  if (rows.length === 0) {
    return { computedAt: null, trending: [], favorites: [], genres: [] };
  }

  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const trending: string[] = [];
  const favorites: string[] = [];
  const genreSlugs: string[] = [];
  const byGenre = new Map<string, string[]>();
  let computedAt: Date | null = null;

  for (const r of sorted) {
    if (r.computedAt && (!computedAt || r.computedAt > computedAt)) {
      computedAt = r.computedAt;
    }
    if (r.kind === "trending") trending.push(r.bookSlug);
    else if (r.kind === "favorites") favorites.push(r.bookSlug);
    else if (r.kind.startsWith(GENRE_KIND_PREFIX)) {
      const slug = r.kind.slice(GENRE_KIND_PREFIX.length);
      if (!byGenre.has(slug)) {
        byGenre.set(slug, []);
        genreSlugs.push(slug);
      }
      byGenre.get(slug)!.push(r.bookSlug);
    }
  }

  return {
    computedAt: computedAt ? computedAt.toISOString() : null,
    trending,
    favorites,
    genres: genreSlugs.map((slug) => ({
      slug,
      name: genreNameFromSlug(slug),
      books: byGenre.get(slug) ?? [],
    })),
  };
}
