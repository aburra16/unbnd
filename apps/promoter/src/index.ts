// The promoter CONSUME LOOP (Story 30 / ADR 0031 §1). A recurring queue consumer
// (cron-fired) that, per run, claims pending promotion jobs, reads each
// submission event, builds the canonical librarian `books` record, signs it with
// the librarian key, publishes to the local relay AND dcosl, and marks the job
// done (recording the canonical event id). Idempotent: every run publishes under
// the SAME address 39999:<librarian>:<slug> (the d-tag = slug), so the relay keeps
// one canonical record (replace, not duplicate). A failed sign/publish marks the
// job `failed` (retriable) and does NOT crash the run; one job's failure never
// aborts the others.
//
// Everything that touches a key, a relay, or the DB is INJECTED so the loop is
// fully fixture-testable with no real LIBRARIAN_NSEC and no live relay.
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  type HexPubkey,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { mapSubmissionToCatalogRecord, type ParsedSubmission } from "./build";

/** A claimed promotion job, as the queue hands it to the loop. */
export type PromotionJob = {
  readonly id: string;
  readonly slug: string;
  readonly requestedBy: string;
  readonly status: string;
  readonly attempts: number;
};

export type PublishOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason?: string };

export type PromoterDeps = {
  /** The librarian pubkey (hex) — the canonical record's author / `books` owner. */
  readonly librarianPubkey: HexPubkey;
  /** Claim a batch of pending jobs (status→promoting, FOR UPDATE SKIP LOCKED). */
  readonly claimPending: () => Promise<PromotionJob[]>;
  /** Read the submitter-signed submission event for a slug from the relay. */
  readonly readSubmission: (slug: string) => Promise<SignedNostrEvent>;
  /** Librarian-sign a template → a signed event with an id (mirrors finalizeEvent). */
  readonly sign: (template: NostrEventTemplate) => SignedNostrEvent;
  /** Publish to the local relay. */
  readonly publishLocal: (event: SignedNostrEvent) => Promise<PublishOutcome>;
  /** Publish to dcosl so it propagates like every catalog record. */
  readonly publishDcosl: (event: SignedNostrEvent) => Promise<PublishOutcome>;
  /** Mark a job done with the canonical event id. */
  readonly markDone: (job: PromotionJob, canonicalId: string) => Promise<void>;
  /** Mark a job failed (retriable) with a reason. */
  readonly markFailed: (job: PromotionJob, reason: string) => Promise<void>;
  /** Wall-clock for the signed event's created_at; deterministic in tests. */
  readonly now?: () => number;
};

// Read a ParsedSubmission off a submitter-signed kind-39999 event's plain tags.
// The worker reads the submission as it travels the wire (d/title/author/...),
// not via the JSON payload — promotion only needs the catalog-facing metadata.
function parseSubmissionEvent(event: SignedNostrEvent): ParsedSubmission {
  const tag = (name: string): string | undefined =>
    event.tags.find((t) => t[0] === name)?.[1];
  const slug = tag("d");
  const title = tag("title");
  const author = tag("author");
  if (!slug || !title || !author) {
    throw new Error("promoter: submission event missing d/title/author tags");
  }
  const yearRaw = tag("year");
  const year = yearRaw !== undefined ? Number(yearRaw) : undefined;
  const subjects = event.tags.filter((t) => t[0] === "subject").map((t) => t[1]);
  return {
    slug,
    title,
    authorName: author,
    isbn13: tag("isbn"),
    isbn10: tag("isbn10"),
    coverUrl: tag("cover"),
    publishYear: Number.isFinite(year) ? (year as number) : undefined,
    language: tag("lang"),
    subjects: subjects.length > 0 ? subjects : undefined,
    blurb: event.content || undefined,
    format: "reference",
  };
}

async function promoteOne(deps: PromoterDeps, job: PromotionJob): Promise<void> {
  const booksHeader = buildBookRecordsHeaderAddress(deps.librarianPubkey);
  const submissionEvent = await deps.readSubmission(job.slug);
  const submission = parseSubmissionEvent(submissionEvent);
  const submitter = asHexPubkey(submissionEvent.pubkey);

  const record = mapSubmissionToCatalogRecord(submission, booksHeader, submitter);
  const createdAt = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  const template = toWireTemplate(toBookRecordEvent(record), createdAt);
  const signed = deps.sign(template);

  const local = await deps.publishLocal(signed);
  const dcosl = await deps.publishDcosl(signed);
  if (!local.ok && !dcosl.ok) {
    await deps.markFailed(job, local.reason ?? dcosl.reason ?? "publish failed");
    return;
  }
  await deps.markDone(job, signed.id);
}

/** One promotion run: claim, then process each job independently. */
export async function runPromotionCycle(deps: PromoterDeps): Promise<void> {
  const jobs = await deps.claimPending();
  for (const job of jobs) {
    try {
      await promoteOne(deps, job);
    } catch (err) {
      await deps.markFailed(
        job,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}
