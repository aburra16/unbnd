// Postgres client + Drizzle adapter per ADR 0003.
import { inArray } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { promotions } from "./schema";
import { migrations } from "./migrations";

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
