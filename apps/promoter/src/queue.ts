// Postgres-backed promotion queue (Story 30 / ADR 0031 §1). The worker claims
// pending jobs with `FOR UPDATE SKIP LOCKED` (concurrency-safe even if ever run
// concurrently) and marks them done/failed. Plain `postgres` (no drizzle dep in
// the worker) over the same `promotions` table the API writes.
import postgres from "postgres";
import type { PromotionJob } from "./index";

export type Queue = {
  claimPending: (limit?: number) => Promise<PromotionJob[]>;
  markDone: (job: PromotionJob, canonicalId: string) => Promise<void>;
  markFailed: (job: PromotionJob, reason: string) => Promise<void>;
  close: () => Promise<void>;
};

type Row = {
  id: string;
  slug: string;
  requested_by: string;
  status: string;
  attempts: number;
};

export function createQueue(databaseUrl: string): Queue {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async claimPending(limit = 20): Promise<PromotionJob[]> {
      const rows = (await sql`
        UPDATE promotions
        SET status = 'promoting', attempts = attempts + 1, updated_at = NOW()
        WHERE id IN (
          SELECT id FROM promotions
          WHERE status = 'pending'
          ORDER BY created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, slug, requested_by, status, attempts
      `) as unknown as Row[];
      return rows.map((r) => ({
        id: r.id,
        slug: r.slug,
        requestedBy: r.requested_by,
        status: r.status,
        attempts: r.attempts,
      }));
    },
    async markDone(job: PromotionJob, canonicalId: string): Promise<void> {
      await sql`
        UPDATE promotions
        SET status = 'done', canonical_id = ${canonicalId}, error = NULL, updated_at = NOW()
        WHERE id = ${job.id}
      `;
    },
    async markFailed(job: PromotionJob, reason: string): Promise<void> {
      await sql`
        UPDATE promotions
        SET status = 'failed', error = ${reason}, updated_at = NOW()
        WHERE id = ${job.id}
      `;
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}
