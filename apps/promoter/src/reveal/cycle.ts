// The reveal job-kind CONSUME CYCLE (Story 33 / ADR 0034 §4). Mirrors
// runPromotionCycle: per run, claim pending reveal rows, build the
// librarian-signed AccusatoryReveal event for each (book, tag) with the row's
// `state`, publish to local + dcosl, and mark the row done with the minted
// event id. A `withdrawn` row mints a state:"withdrawn" event at the SAME
// (book, tag) address (reversible by replace, AC-6). A both-relay publish
// failure marks the row failed (retriable) and does NOT crash the run.
//
// Everything that touches a key, a relay, or the DB is INJECTED so the cycle is
// fully fixture-testable with no real LIBRARIAN_NSEC and no live relay.
import {
  toAccusatoryRevealEvent,
  toWireTemplate,
  type HexPubkey,
  type NostrEventTemplate,
  type RevealState,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { buildAccusatoryRevealEvent } from "./build";

/** A claimed reveal job, as the queue hands it to the cycle. */
export type RevealJob = {
  readonly id: string;
  readonly bookSlug: string;
  readonly tagSlug: string;
  readonly state: RevealState;
  readonly requestedBy: string;
  readonly status: string;
  readonly attempts: number;
};

export type PublishOutcome =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason?: string };

export type RevealDeps = {
  readonly librarianPubkey: HexPubkey;
  /** Claim a batch of pending reveal rows (status→minting, FOR UPDATE SKIP LOCKED). */
  readonly claimPending: () => Promise<RevealJob[]>;
  /** Librarian-sign a template → a signed event with an id (mirrors finalizeEvent). */
  readonly sign: (template: NostrEventTemplate) => SignedNostrEvent;
  readonly publishLocal: (event: SignedNostrEvent) => Promise<PublishOutcome>;
  readonly publishDcosl: (event: SignedNostrEvent) => Promise<PublishOutcome>;
  /** Mark a job done with the minted reveal event id. */
  readonly markDone: (job: RevealJob, mintedId: string) => Promise<void>;
  /** Mark a job failed (retriable) with a reason. */
  readonly markFailed: (job: RevealJob, reason: string) => Promise<void>;
  /** Wall-clock for the signed event's created_at; deterministic in tests. */
  readonly now?: () => number;
};

async function revealOne(deps: RevealDeps, job: RevealJob): Promise<void> {
  const reveal = buildAccusatoryRevealEvent({
    librarianPubkey: deps.librarianPubkey,
    bookSlug: job.bookSlug,
    tagSlug: job.tagSlug,
    state: job.state,
  });
  const createdAt = deps.now ? deps.now() : Math.floor(Date.now() / 1000);
  const template = toWireTemplate(toAccusatoryRevealEvent(reveal), createdAt);
  const signed = deps.sign(template);

  const local = await deps.publishLocal(signed);
  const dcosl = await deps.publishDcosl(signed);
  if (!local.ok && !dcosl.ok) {
    await deps.markFailed(job, local.reason ?? dcosl.reason ?? "publish failed");
    return;
  }
  await deps.markDone(job, signed.id);
}

/** One reveal run: claim, then process each job independently. */
export async function runRevealCycle(deps: RevealDeps): Promise<void> {
  const jobs = await deps.claimPending();
  for (const job of jobs) {
    try {
      await revealOne(deps, job);
    } catch (err) {
      await deps.markFailed(job, err instanceof Error ? err.message : String(err));
    }
  }
}
