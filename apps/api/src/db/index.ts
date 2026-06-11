// Postgres client + Drizzle adapter per ADR 0003.
import { and, eq, inArray } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { homepageShelves, promotions, reveals } from "./schema";
import { migrations } from "./migrations";
import type { CachedShelfSet } from "../routes/homepage-shelves";

/** The promotion job lifecycle states (ADR 0031 §1). */
export type PromotionStatus =
  | "pending"
  | "promoting"
  | "done"
  | "failed"
  | "demote_pending"
  | "demoting"
  | "demoted"
  | "demote_failed";

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

/**
 * Story 78 / ADR 0076 — enqueue an in-product accusatory reveal/withdraw. Mirrors
 * the worker's upsert (`ON CONFLICT (book_slug, tag_slug)`): always re-queues so
 * the off-path worker re-mints the new state (that is how revealed↔withdrawn
 * toggles). `requestedBy` records the curator (the audit actor). The api only
 * enqueues; the librarian signing key never lives here.
 */
export async function enqueueReveal(
  bookSlug: string,
  tagSlug: string,
  state: "revealed" | "withdrawn",
  requestedBy: string,
): Promise<{ status: "queued" | "updated" }> {
  const [row] = await db
    .insert(reveals)
    .values({ bookSlug, tagSlug, state, requestedBy, status: "pending" })
    .onConflictDoUpdate({
      target: [reveals.bookSlug, reveals.tagSlug],
      set: {
        state,
        requestedBy,
        status: "pending",
        mintedId: null,
        error: null,
        updatedAt: new Date(),
      },
    })
    .returning({ createdAt: reveals.createdAt, updatedAt: reveals.updatedAt });
  // On a fresh insert both timestamps default to the same NOW(); a conflict
  // update bumps updatedAt only → they differ.
  const inserted = row ? row.createdAt.getTime() === row.updatedAt.getTime() : true;
  return { status: inserted ? "queued" : "updated" };
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

/**
 * Enqueue a promotion (ADR 0031; relocated from index.ts for Story 80 so the
 * demoted -> pending re-promote branch lives beside the state machine).
 * Idempotent on slug: a unique-violation re-enqueue is `already` — UNLESS the
 * existing row is `demoted`, in which case a deliberate manual re-promote
 * resets it to `pending` (ADR 0078 §2). The #77 auto-promote sweep skips any
 * slug with any status, so only this human path ever revives a demoted slug.
 */
export async function enqueuePromotion(
  slug: string,
  requestedBy: string,
): Promise<{ status: "queued" | "already" }> {
  try {
    await db.insert(promotions).values({ slug, requestedBy });
    return { status: "queued" };
  } catch (err) {
    if (
      err &&
      typeof err === "object" &&
      "code" in err &&
      (err as { code?: string }).code === "23505"
    ) {
      // The slug has a row. A demoted row — and only a demoted row — is
      // revived by a deliberate re-promote.
      const reset = await db
        .update(promotions)
        .set({
          status: "pending",
          requestedBy,
          canonicalId: null,
          error: null,
          updatedAt: new Date(),
        })
        .where(and(eq(promotions.slug, slug), eq(promotions.status, "demoted")))
        .returning({ id: promotions.id });
      return { status: reset.length > 0 ? "queued" : "already" };
    }
    throw err;
  }
}

/**
 * Enqueue a demotion (Story 80 / ADR 0078 §2): a gated UPDATE — only a `done`
 * promotion (or a retriable `demote_failed`) can move to `demote_pending`,
 * recording the requesting curator. No row (never promoted / seeded) →
 * `not_promoted`; a row in any other state (in flight, already demoted or
 * queued) → `already` (the idempotent no-op).
 */
export async function enqueueDemotion(
  slug: string,
  requestedBy: string,
): Promise<{ status: "queued" | "already" | "not_promoted" }> {
  const updated = await db
    .update(promotions)
    .set({
      status: "demote_pending",
      requestedBy,
      error: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(promotions.slug, slug),
        inArray(promotions.status, ["done", "demote_failed"]),
      ),
    )
    .returning({ id: promotions.id });
  if (updated.length > 0) return { status: "queued" };

  const existing = await db
    .select({ status: promotions.status })
    .from(promotions)
    .where(eq(promotions.slug, slug));
  if (existing.length === 0) return { status: "not_promoted" };
  // pending/promoting (not yet a catalog record) is not demotable either, but
  // an in-flight or already-demoted row is an "already" no-op, never an error
  // for the demote_* states; a pre-done row maps to not_promoted (no record).
  const st = existing[0]!.status;
  return st === "pending" || st === "promoting" || st === "failed"
    ? { status: "not_promoted" }
    : { status: "already" };
}
