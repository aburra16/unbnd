// Postgres client + Drizzle adapter per ADR 0003. Stub — Implementer wires up.
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "./schema";

export type DbClient = PostgresJsDatabase<typeof schema>;

/** The transaction handle passed to a `db.transaction(async (tx) => ...)` callback. */
export type DbTx = Parameters<Parameters<DbClient["transaction"]>[0]>[0];

/** Anything you can run a query on — the full client or a live transaction. */
export type DbOrTx = DbClient | DbTx;

/**
 * Module-level db handle. Real construction happens in `createDb`, called
 * once at startup with the validated DATABASE_URL. Until then, any use
 * throws so a missing wire-up fails loudly rather than silently.
 */
export const db: DbClient = new Proxy({} as DbClient, {
  get() {
    throw new Error("db not implemented");
  },
});

export function createDb(_databaseUrl: string): DbClient {
  throw new Error("createDb not implemented");
}

export async function runMigrations(_databaseUrl: string): Promise<void> {
  throw new Error("runMigrations not implemented");
}
