// FAILING TESTS (in a DATABASE_URL env; skipped otherwise, like the auth
// integration suite) — Story 80 / ADR 0078 §2: the promotions state machine's
// demotion arc, against real Postgres. These cover what a mock can't: the
// gated UPDATE (only done/demote_failed rows demote), the idempotent no-op,
// and the demoted -> pending reset that ONLY a deliberate re-promote performs
// (the #77 sweep skips any status, so no-auto-re-promote is structural).
//
// Requires `enqueuePromotion`/`enqueueDemotion` exported from src/db (the
// implementer relocates the index.ts closure beside the state machine).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  createDb,
  enqueueDemotion,
  enqueuePromotion,
  runMigrations,
  type DbClient,
} from "../../src/db";
import { promotions } from "../../src/db/schema";

const DATABASE_URL = process.env.DATABASE_URL;
const suite = DATABASE_URL ? describe : describe.skip;

if (!DATABASE_URL) {
  // No silent caps: announce why this suite did not run.
  // eslint-disable-next-line no-console
  console.warn(
    "[integration] DATABASE_URL not set — skipping the promotions-demotion state-machine suite.",
  );
}

const CURATOR = "c".repeat(64);
const OTHER_CURATOR = "d".repeat(64);
const SLUG = "it-demotion--state-machine";

suite("promotions state machine — the demotion arc (real Postgres)", () => {
  let db: DbClient;

  beforeAll(async () => {
    await runMigrations(DATABASE_URL!);
    db = createDb(DATABASE_URL!);
    await db.delete(promotions).where(eq(promotions.slug, SLUG));
  });

  afterAll(async () => {
    await db.delete(promotions).where(eq(promotions.slug, SLUG));
  });

  async function statusOf(slug: string): Promise<string | null> {
    const rows = await db
      .select({ status: promotions.status, requestedBy: promotions.requestedBy })
      .from(promotions)
      .where(eq(promotions.slug, slug));
    return rows[0]?.status ?? null;
  }

  it("walks the full arc: queued -> done -> demote_pending -> demoted -> pending (re-promote)", async () => {
    // Promote (fresh slug) → pending row.
    expect((await enqueuePromotion(SLUG, CURATOR)).status).toBe("queued");
    expect(await statusOf(SLUG)).toBe("pending");

    // A demote of a not-yet-done promotion is refused (gated UPDATE).
    expect((await enqueueDemotion(SLUG, CURATOR)).status).toBe("not_promoted");

    // Worker finishes the promotion (simulated).
    await db.update(promotions).set({ status: "done" }).where(eq(promotions.slug, SLUG));

    // Promote again while done → already (unchanged behavior).
    expect((await enqueuePromotion(SLUG, CURATOR)).status).toBe("already");

    // Demote a done promotion → demote_pending, recording the curator.
    expect((await enqueueDemotion(SLUG, OTHER_CURATOR)).status).toBe("queued");
    expect(await statusOf(SLUG)).toBe("demote_pending");
    const row = (
      await db.select().from(promotions).where(eq(promotions.slug, SLUG))
    )[0]!;
    expect(row.requestedBy).toBe(OTHER_CURATOR);

    // Re-demote while queued → idempotent no-op (already), state unchanged.
    expect((await enqueueDemotion(SLUG, CURATOR)).status).toBe("already");
    expect(await statusOf(SLUG)).toBe("demote_pending");

    // Worker fulfills (simulated) → demoted. The #77 sweep skips any status,
    // so a demoted row is never auto-re-promoted.
    await db.update(promotions).set({ status: "demoted" }).where(eq(promotions.slug, SLUG));
    expect((await enqueueDemotion(SLUG, CURATOR)).status).toBe("already");

    // ONLY a deliberate manual re-promote resets demoted -> pending.
    expect((await enqueuePromotion(SLUG, CURATOR)).status).toBe("queued");
    expect(await statusOf(SLUG)).toBe("pending");
  });

  it("a demote_failed row is retriable: enqueueDemotion re-queues it", async () => {
    await db.update(promotions).set({ status: "demote_failed" }).where(eq(promotions.slug, SLUG));
    expect((await enqueueDemotion(SLUG, CURATOR)).status).toBe("queued");
    expect(await statusOf(SLUG)).toBe("demote_pending");
  });

  it("a never-promoted slug (e.g. seeded) is structurally undemotable", async () => {
    expect((await enqueueDemotion("never-promoted--zz", CURATOR)).status).toBe("not_promoted");
  });
});
