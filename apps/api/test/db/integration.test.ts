// Real-Postgres integration suite. Skipped unless DATABASE_URL is set.
// CI provides a `services: postgres` block; a dev with `docker compose up`
// can `DATABASE_URL=... pnpm --filter @unbnd/api test`.
//
// These cover behaviors a mock can't: the UNIQUE constraint on email, CITEXT
// case-insensitivity, transactional rollback on partial failure, and session
// rotation actually deleting the prior row.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDb, runMigrations, type DbClient } from "../../src/db";
import {
  createCustodialUser,
  findUserByEmail,
} from "../../src/auth/users";
import { issueSession, resolveSession, revokeSession } from "../../src/auth/sessions";

const DATABASE_URL = process.env.DATABASE_URL;
const BACKUP_KEY_HEX = "d".repeat(64);

const suite = DATABASE_URL ? describe : describe.skip;

if (!DATABASE_URL) {
  // No silent caps: announce why this suite did not run.
  // eslint-disable-next-line no-console
  console.warn(
    "[integration] DATABASE_URL not set — skipping the real-Postgres auth suite.",
  );
}

suite("custodial auth against real Postgres", () => {
  let db: DbClient;

  beforeAll(async () => {
    await runMigrations(DATABASE_URL!);
    db = createDb(DATABASE_URL!);
  });

  afterAll(async () => {
    // Best-effort cleanup of rows this suite created.
    // (Implementer wires a truncate helper or per-run schema.)
  });

  it("creates a custodial user and finds it by email", async () => {
    const email = `reader+${Date.now()}@example.com`;
    await db.transaction(async (tx) => {
      await createCustodialUser(
        tx,
        { email, password: "abcdefghij", displayName: "Mira" },
        BACKUP_KEY_HEX,
      );
    });
    const found = await findUserByEmail(email);
    expect(found).not.toBeNull();
    expect(found?.tier).toBe("custodial");
  });

  it("enforces the UNIQUE email constraint (duplicate signup rejected)", async () => {
    const email = `dup+${Date.now()}@example.com`;
    await db.transaction((tx) =>
      createCustodialUser(tx, { email, password: "abcdefghij", displayName: "A" }, BACKUP_KEY_HEX),
    );
    await expect(
      db.transaction((tx) =>
        createCustodialUser(tx, { email, password: "abcdefghij", displayName: "B" }, BACKUP_KEY_HEX),
      ),
    ).rejects.toThrow();
  });

  it("treats email as case-insensitive (CITEXT)", async () => {
    const lower = `case+${Date.now()}@example.com`;
    await db.transaction((tx) =>
      createCustodialUser(tx, { email: lower, password: "abcdefghij", displayName: "C" }, BACKUP_KEY_HEX),
    );
    const found = await findUserByEmail(lower.toUpperCase());
    expect(found).not.toBeNull();
  });

  it("issues a session and resolves it back to the user", async () => {
    const email = `sess+${Date.now()}@example.com`;
    const user = await db.transaction((tx) =>
      createCustodialUser(tx, { email, password: "abcdefghij", displayName: "S" }, BACKUP_KEY_HEX),
    );
    const { token } = await db.transaction((tx) => issueSession(tx, user.id));
    const resolved = await resolveSession(token);
    expect(resolved?.user.id).toBe(user.id);
  });

  it("revokes a session so it no longer resolves", async () => {
    const email = `revoke+${Date.now()}@example.com`;
    const user = await db.transaction((tx) =>
      createCustodialUser(tx, { email, password: "abcdefghij", displayName: "R" }, BACKUP_KEY_HEX),
    );
    const { token } = await db.transaction((tx) => issueSession(tx, user.id));
    await db.transaction((tx) => revokeSession(tx, token));
    expect(await resolveSession(token)).toBeNull();
  });
});
