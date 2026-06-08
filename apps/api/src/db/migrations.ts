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
  {
    // ADR 0034 §4: the accusatory-reveal queue. The operator CLI upserts a row
    // keyed on (book_slug, tag_slug); the off-path `apps/promoter` worker claims
    // pending rows, mints + librarian-signs the reveal/withdraw event, and marks
    // done with the minted event id. UNIQUE(book_slug, tag_slug) makes a
    // re-trigger / reveal→withdraw→reveal flip idempotent (latest intent wins).
    name: "0004_reveals",
    sql: `
      CREATE TABLE IF NOT EXISTS reveals (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        book_slug     TEXT NOT NULL,
        tag_slug      TEXT NOT NULL,
        state         TEXT NOT NULL CHECK (state IN ('revealed','withdrawn')),
        requested_by  CHAR(64) NOT NULL,
        status        TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','minting','done','failed')),
        minted_id     TEXT,
        error         TEXT,
        attempts      INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (book_slug, tag_slug)
      );

      CREATE INDEX IF NOT EXISTS idx_reveals_status ON reveals(status);
    `,
  },
  {
    // ADR 0036 §2: the homepage trust-shelf cache. The off-path `apps/shelves`
    // worker computes the house-PoV Trending / Community Favorites / genre
    // shelves and REPLACES this observer's rows in one transaction (a refresh is
    // atomic — a Reader never sees a half-written set). The serve API reads it
    // and never computes. The cache stores ONLY ordered slugs (+ kind, position,
    // observer_hex, computed_at) — the API hydrates display fields through the
    // live book read so author overlays never go stale. `observer_hex` records
    // whose vantage the row holds (house only today; future-proofs the swap).
    // UNIQUE(observer_hex, kind, position) is the ordered replace key. An empty
    // shelf = zero rows for that kind (honest empty by absence). The refresh
    // cadence is the invalidation story (CLAUDE.md invariant 3, §2.9 exception).
    name: "0005_homepage_shelves",
    sql: `
      CREATE TABLE IF NOT EXISTS homepage_shelves (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        observer_hex CHAR(64) NOT NULL,
        kind         TEXT NOT NULL,
        position     INTEGER NOT NULL,
        book_slug    TEXT NOT NULL,
        computed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (observer_hex, kind, position)
      );

      CREATE INDEX IF NOT EXISTS idx_homepage_shelves_kind
        ON homepage_shelves(observer_hex, kind, position);
    `,
  },
  {
    // Story 76 / ADR 0074 — sovereignty upgrade. When a custodial user takes
    // ownership of their key (reveals their nsec), stamp the moment. The tier
    // stays custodial (the account keeps working); this is the "ownership taken"
    // signal the Settings card reads. Additive + idempotent.
    name: "0006_key_exported_at",
    sql: `
      ALTER TABLE users ADD COLUMN IF NOT EXISTS key_exported_at TIMESTAMPTZ;
    `,
  },
];
