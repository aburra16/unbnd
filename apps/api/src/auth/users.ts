// User queries per ADR 0003.
import { and, eq, isNull } from "drizzle-orm";
import { npubEncode } from "nostr-tools/nip19";
import { db, type DbOrTx } from "../db";
import { users, type UserRow } from "../db/schema";
import {
  encryptWithBackupKey,
  encryptWithPassword,
  generateCustodialKeypair,
} from "./crypto";
import { normalizeEmail } from "./passwords";

export type CreateCustodialUserInput = {
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
};

/**
 * Create a custodial user: generate a keypair, encrypt the nsec twice
 * (NIP-49 with the password, XChaCha20-Poly1305 with the backup key),
 * wipe the plaintext, insert the row. Runs inside the caller's transaction.
 */
export async function createCustodialUser(
  tx: DbOrTx,
  input: CreateCustodialUserInput,
  backupKeyHex: string,
): Promise<UserRow> {
  const { secret, pubkeyHex } = generateCustodialKeypair();
  try {
    const encryptedNsecPassword = encryptWithPassword(secret, input.password);
    const encryptedNsecBackup = encryptWithBackupKey(secret, backupKeyHex);

    const [row] = await tx
      .insert(users)
      .values({
        email: normalizeEmail(input.email),
        displayName: input.displayName,
        pubkeyHex,
        tier: "custodial",
        encryptedNsecPassword,
        encryptedNsecBackup,
      })
      .returning();
    return row!;
  } finally {
    // Best-effort wipe of the plaintext secret.
    secret.fill(0);
  }
}

/**
 * Update a user's display name (the recovery/audit copy + kind-0 republish
 * seed). Runs on the caller's executor (full client or a live transaction) so
 * the custodial rename can keep Postgres in lockstep with the published kind-0
 * (Story 27b, ADR 0028). Follows the existing drizzle eq/returning idiom.
 */
export async function updateDisplayName(
  executor: DbOrTx,
  userId: string,
  name: string,
): Promise<UserRow> {
  const [row] = await executor
    .update(users)
    .set({ displayName: name })
    .where(eq(users.id, userId))
    .returning();
  return row!;
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, normalizeEmail(email)))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(id: string): Promise<UserRow | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * Public-facing shape: never exposes hex pubkey or encrypted columns.
 * `email` is null for sovereign (Tier 1) users, who have no email.
 */
export type PublicUser = {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly npub: string;
  /** Story 76 / ADR 0074: ISO timestamp the custodial user took ownership of
   * their key (revealed their nsec); null until then. The tier stays custodial. */
  readonly keyExportedAt: string | null;
};

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    npub: npubEncode(row.pubkeyHex),
    keyExportedAt: row.keyExportedAt?.toISOString() ?? null,
  };
}

/** Stamp `key_exported_at` once (first export). Idempotent: a second call leaves
 * the original timestamp untouched (the WHERE only matches a null column). */
export async function markKeyExported(tx: DbOrTx, id: string): Promise<void> {
  await tx
    .update(users)
    .set({ keyExportedAt: new Date() })
    .where(and(eq(users.id, id), isNull(users.keyExportedAt)));
}

/**
 * Find a sovereign user by pubkey, or create one. Sovereign rows have no
 * email and no encrypted-nsec material; the default display name is a
 * truncated npub. Runs inside the caller's transaction.
 */
function truncatedNpub(pubkeyHex: string): string {
  const npub = npubEncode(pubkeyHex);
  // npub1abcd…wxyz — recognizable, fits the display-name CHECK (1..100).
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}

export async function createOrLoadSovereignUser(
  tx: DbOrTx,
  pubkeyHex: string,
): Promise<UserRow> {
  const existing = await tx
    .select()
    .from(users)
    .where(eq(users.pubkeyHex, pubkeyHex))
    .limit(1);
  if (existing[0]) return existing[0];

  const [row] = await tx
    .insert(users)
    .values({
      email: null,
      displayName: truncatedNpub(pubkeyHex),
      pubkeyHex,
      tier: "sovereign",
      encryptedNsecPassword: null,
      encryptedNsecBackup: null,
    })
    .returning();
  return row!;
}
