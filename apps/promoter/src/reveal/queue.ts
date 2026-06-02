// Postgres-backed reveal queue (Story 33 / ADR 0034 §4). Plain `postgres` (no
// drizzle dep in the worker) over the `reveals` table the migration creates.
//   - enqueueReveal: the operator CLI upsert (ON CONFLICT (book_slug, tag_slug)
//     DO UPDATE), so a re-trigger / reveal→withdraw→reveal flip keeps ONE row,
//     latest intent winning (idempotent).
//   - claimPending / markDone / markFailed: the worker cycle's queue seams,
//     mirroring queue.ts (FOR UPDATE SKIP LOCKED).
import postgres from "postgres";
import type { RevealState } from "@unbnd/schemas";
import type { RevealJob } from "./cycle";

export type EnqueueRevealResult = { readonly status: "queued" | "updated" };

export type RevealQueue = {
  enqueueReveal: (
    bookSlug: string,
    tagSlug: string,
    state: RevealState,
    requestedBy: string,
  ) => Promise<EnqueueRevealResult>;
  claimPending: (limit?: number) => Promise<RevealJob[]>;
  markDone: (job: RevealJob, mintedId: string) => Promise<void>;
  markFailed: (job: RevealJob, reason: string) => Promise<void>;
  close: () => Promise<void>;
};

type Row = {
  id: string;
  book_slug: string;
  tag_slug: string;
  state: RevealState;
  requested_by: string;
  status: string;
  attempts: number;
};

export function createRevealQueue(databaseUrl: string): RevealQueue {
  const sql = postgres(databaseUrl, { max: 1 });
  return {
    async enqueueReveal(bookSlug, tagSlug, state, requestedBy): Promise<EnqueueRevealResult> {
      const rows = (await sql`
        INSERT INTO reveals (book_slug, tag_slug, state, requested_by, status)
        VALUES (${bookSlug}, ${tagSlug}, ${state}, ${requestedBy}, 'pending')
        ON CONFLICT (book_slug, tag_slug) DO UPDATE
          SET state = EXCLUDED.state,
              requested_by = EXCLUDED.requested_by,
              status = 'pending',
              minted_id = NULL,
              error = NULL,
              updated_at = NOW()
        RETURNING (xmax = 0) AS inserted
      `) as unknown as Array<{ inserted: boolean }>;
      return { status: rows[0]?.inserted ? "queued" : "updated" };
    },
    async claimPending(limit = 20): Promise<RevealJob[]> {
      const rows = (await sql`
        UPDATE reveals
        SET status = 'minting', attempts = attempts + 1, updated_at = NOW()
        WHERE id IN (
          SELECT id FROM reveals
          WHERE status = 'pending'
          ORDER BY created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, book_slug, tag_slug, state, requested_by, status, attempts
      `) as unknown as Row[];
      return rows.map((r) => ({
        id: r.id,
        bookSlug: r.book_slug,
        tagSlug: r.tag_slug,
        state: r.state,
        requestedBy: r.requested_by,
        status: r.status,
        attempts: r.attempts,
      }));
    },
    async markDone(job: RevealJob, mintedId: string): Promise<void> {
      await sql`
        UPDATE reveals
        SET status = 'done', minted_id = ${mintedId}, error = NULL, updated_at = NOW()
        WHERE id = ${job.id}
      `;
    },
    async markFailed(job: RevealJob, reason: string): Promise<void> {
      await sql`
        UPDATE reveals
        SET status = 'failed', error = ${reason}, updated_at = NOW()
        WHERE id = ${job.id}
      `;
    },
    async close(): Promise<void> {
      await sql.end({ timeout: 5 });
    },
  };
}
