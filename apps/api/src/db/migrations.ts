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
  {
    name: "0002_sovereign_and_challenges",
    sql: `
      -- Sovereign (Tier 1) users hold their own key and have no email or
      -- server-held key material. Relax the NOT NULLs and enforce the tier
      -- invariant with a CHECK.
      ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
      ALTER TABLE users ALTER COLUMN encrypted_nsec_password DROP NOT NULL;
      ALTER TABLE users ALTER COLUMN encrypted_nsec_backup DROP NOT NULL;

      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'users_tier_key_material'
        ) THEN
          ALTER TABLE users ADD CONSTRAINT users_tier_key_material CHECK (
            (tier = 'custodial'
              AND email IS NOT NULL
              AND encrypted_nsec_password IS NOT NULL
              AND encrypted_nsec_backup IS NOT NULL)
            OR
            (tier = 'sovereign'
              AND email IS NULL
              AND encrypted_nsec_password IS NULL
              AND encrypted_nsec_backup IS NULL)
          );
        END IF;
      END $$;

      CREATE TABLE IF NOT EXISTS challenges (
        pubkey      CHAR(64) NOT NULL,
        nonce       TEXT NOT NULL,
        expires_at  TIMESTAMPTZ NOT NULL,
        consumed_at TIMESTAMPTZ,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (pubkey, nonce)
      );

      CREATE INDEX IF NOT EXISTS idx_challenges_expires_at ON challenges(expires_at);
    `,
  },
  {
    name: "0003_promotions",
    sql: `
      CREATE TABLE IF NOT EXISTS promotions (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slug            TEXT NOT NULL UNIQUE,
        requested_by    CHAR(64) NOT NULL,
        status          TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending','promoting','done','failed')),
        canonical_id    TEXT,
        error           TEXT,
        attempts        INTEGER NOT NULL DEFAULT 0,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_promotions_status ON promotions(status);
    `,
  },
];
