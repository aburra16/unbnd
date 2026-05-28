// User queries per ADR 0003.
import { eq } from "drizzle-orm";
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

/** Public-facing shape: never exposes hex pubkey or encrypted columns. */
export type PublicUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly npub: string;
};

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    email: row.email,
    displayName: row.displayName,
    npub: npubEncode(row.pubkeyHex),
  };
}
