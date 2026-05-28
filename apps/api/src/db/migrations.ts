// Migrations per ADR 0003, embedded as TypeScript strings so they ship
// identically in dev (tsx) and prod (tsc → dist) without a .sql copy step.
// Each migration is idempotent (IF NOT EXISTS) so runMigrations is safe to
// re-run on every startup.

export type Migration = { readonly name: string; readonly sql: string };

export const migrations: readonly Migration[] = [
  {
    name: "0001_initial",
    sql: `
      CREATE EXTENSION IF NOT EXISTS citext;

      CREATE TABLE IF NOT EXISTS users (
        id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email                   CITEXT NOT NULL UNIQUE,
        display_name            TEXT NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 100),
        pubkey_hex              CHAR(64) NOT NULL UNIQUE,
        tier                    TEXT NOT NULL CHECK (tier IN ('custodial', 'sovereign')),
        encrypted_nsec_password TEXT NOT NULL,
        encrypted_nsec_backup   BYTEA NOT NULL,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id           BYTEA PRIMARY KEY,
        user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at   TIMESTAMPTZ NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
    `,
  },
];
