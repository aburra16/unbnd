// User queries per ADR 0003. Stubs throw until implemented.
import type { DbOrTx } from "../db";
import type { UserRow } from "../db/schema";

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
  _tx: DbOrTx,
  _input: CreateCustodialUserInput,
  _backupKeyHex: string,
): Promise<UserRow> {
  throw new Error("createCustodialUser not implemented");
}

export async function findUserByEmail(
  _email: string,
): Promise<UserRow | null> {
  throw new Error("findUserByEmail not implemented");
}

export async function findUserById(_id: string): Promise<UserRow | null> {
  throw new Error("findUserById not implemented");
}

/** Public-facing shape: never exposes hex pubkey or encrypted columns. */
export type PublicUser = {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly npub: string;
};

export function toPublicUser(_row: UserRow): PublicUser {
  throw new Error("toPublicUser not implemented");
}
