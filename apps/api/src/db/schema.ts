// Drizzle schema for the custodial-auth tables per ADR 0003.
import {
  char,
  customType,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

// Postgres BYTEA — Drizzle has no native bytea column type.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Postgres CITEXT (case-insensitive text) — requires the citext extension.
const citext = customType<{ data: string }>({
  dataType() {
    return "citext";
  },
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  // Nullable: sovereign (Tier 1) users authenticate by key and have no email.
  // UNIQUE still holds for custodial emails (Postgres allows multiple NULLs).
  email: citext("email").unique(),
  displayName: text("display_name").notNull(),
  pubkeyHex: char("pubkey_hex", { length: 64 }).notNull().unique(),
  tier: text("tier").notNull(),
  // Nullable: sovereign users hold their own key; the server stores none.
  encryptedNsecPassword: text("encrypted_nsec_password"),
  encryptedNsecBackup: bytea("encrypted_nsec_backup"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const challenges = pgTable("challenges", {
  pubkey: char("pubkey", { length: 64 }).notNull(),
  nonce: text("nonce").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const sessions = pgTable("sessions", {
  id: bytea("id").primaryKey(), // SHA-256 of the raw cookie token
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Promotion queue (ADR 0031 §1). The API enqueues a gated promote request; the
// off-path `apps/promoter` worker claims pending rows, mints + signs + publishes
// the canonical librarian record, and marks the job done. `slug` is UNIQUE so a
// double-promote collides (idempotent enqueue).
export const promotions = pgTable("promotions", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  requestedBy: char("requested_by", { length: 64 }).notNull(),
  status: text("status").notNull().default("pending"),
  canonicalId: text("canonical_id"),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

// Accusatory-reveal queue (ADR 0034 §4). The operator CLI upserts a row keyed
// on (book_slug, tag_slug); the off-path `apps/promoter` worker mints the
// librarian-signed reveal/withdraw event and marks the row done with its id.
// UNIQUE(book_slug, tag_slug) makes the trigger idempotent (latest intent wins).
export const reveals = pgTable(
  "reveals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bookSlug: text("book_slug").notNull(),
    tagSlug: text("tag_slug").notNull(),
    state: text("state").notNull(),
    requestedBy: char("requested_by", { length: 64 }).notNull(),
    status: text("status").notNull().default("pending"),
    mintedId: text("minted_id"),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    bookTagUnique: unique("reveals_book_tag_key").on(t.bookSlug, t.tagSlug),
  }),
);

export type UserRow = typeof users.$inferSelect;
export type NewUserRow = typeof users.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type ChallengeRow = typeof challenges.$inferSelect;
export type PromotionRow = typeof promotions.$inferSelect;
export type NewPromotionRow = typeof promotions.$inferInsert;
export type RevealRow = typeof reveals.$inferSelect;
export type NewRevealRow = typeof reveals.$inferInsert;
export type RevealStatus = "pending" | "minting" | "done" | "failed";
