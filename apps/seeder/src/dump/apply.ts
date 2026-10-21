// Publishing the import's plan (Story 109 / ADR 0097 §5–§7). Each book is
// re-checked against the hub just before it is written, because a demotion, a
// community promotion or a labels pass may have changed it since the dry run;
// then its record and any genre assertion the librarian has not made go out,
// one event at a time, paced, and checkpointed so a dropped run resumes.
import {
  buildBookTagAssertionsHeaderAddress,
  fromBookTagAssertionEvent,
  fromWireEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type BookRecord,
  type BookTagAssertion,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { Checkpoint } from "../checkpoint";
import { fingerprint } from "../fingerprint";
import { liveSummary, recordEventFor } from "./plan";

export type PlannedBook = {
  readonly slug: string;
  readonly kind: "new" | "changed";
  readonly record: BookRecord;
  readonly genres: readonly string[];
};

export type ApplyDeps = {
  readonly librarian: string;
  readonly dumpDate: string;
  /** The librarian's versions of the slug's record on the hub. */
  readonly readCurrent: (slug: string) => Promise<SignedNostrEvent[]>;
  /** The tag assertions naming the slug's book on the hub. */
  readonly readAssertions: (slug: string) => Promise<SignedNostrEvent[]>;
  readonly sign: (template: NostrEventTemplate) => SignedNostrEvent;
  readonly publish: (event: SignedNostrEvent) => Promise<{ ok: true; id: string } | { ok: false; reason: string }>;
  readonly checkpoint: Checkpoint;
  /** Seconds. */
  readonly now: () => number;
  readonly sleep: (ms: number) => Promise<void>;
  readonly ratePerSecond: number;
  readonly log?: (message: string) => void;
};

export type ApplySummary = { records: number; assertions: number; skipped: number; failed: number };

const newest = (events: readonly SignedNostrEvent[]) =>
  [...events].sort((a, b) => b.created_at - a.created_at || a.id.localeCompare(b.id))[0];

export async function applyPlan(books: Iterable<PlannedBook> | AsyncIterable<PlannedBook>, deps: ApplyDeps): Promise<ApplySummary> {
  const log = deps.log ?? (() => {});
  const gap = Math.ceil(1000 / deps.ratePerSecond);
  const assertionsHeader = buildBookTagAssertionsHeaderAddress(deps.librarian as never);
  const summary: ApplySummary = { records: 0, assertions: 0, skipped: 0, failed: 0 };

  const send = async (template: NostrEventTemplate, what: string): Promise<boolean> => {
    let ok = false;
    try {
      const result = await deps.publish(deps.sign(template));
      ok = result.ok;
      if (!result.ok) log(`[import] ${what}: refused (${result.reason})`);
    } catch (err) {
      log(`[import] ${what}: ${err instanceof Error ? err.message : String(err)}`);
    }
    await deps.sleep(gap);
    return ok;
  };

  for await (const book of books) {
    const fp = fingerprint(book.record);
    const key = `import:${deps.dumpDate}:${book.slug}:${fp}`;
    if (deps.checkpoint.has(key)) {
      summary.skipped++;
      continue;
    }

    // Re-check against the hub (ADR 0097 §5): ownership and content may have moved.
    const current = newest(await deps.readCurrent(book.slug));
    const live = current ? liveSummary(current) : undefined;
    if (live && !live.owned) {
      summary.skipped++;
      continue;
    }
    if (live && live.fingerprint === fp) {
      // The record is already right; its genres may still be missing.
      summary.skipped++;
    } else if (await send(recordEventFor(book.record, live, deps.now()), book.slug)) {
      summary.records++;
    } else {
      summary.failed++;
      continue;
    }

    const made = new Set<string>();
    for (const e of await deps.readAssertions(book.slug)) {
      if (e.pubkey !== deps.librarian) continue;
      try {
        made.add(fromBookTagAssertionEvent(fromWireEvent(e) as never).tagSlug);
      } catch {
        continue;
      }
    }
    let complete = true;
    for (const genre of book.genres) {
      if (made.has(genre)) continue;
      const assertion: BookTagAssertion = {
        bookSlug: book.slug,
        bookAddress: { kind: 39999, pubkey: deps.librarian as never, dTag: book.slug },
        tagSlug: genre,
        tagType: "genre",
        polarity: 1,
        asserterPubkey: deps.librarian as never,
        parentHeader: assertionsHeader,
      };
      if (await send(toWireTemplate(toBookTagAssertionEvent(assertion), deps.now()), `${book.slug} ${genre}`)) {
        summary.assertions++;
      } else {
        complete = false;
      }
    }
    // Only a book whose record and every genre went out is done.
    if (complete) deps.checkpoint.add(key);
    else summary.failed++;
  }
  return summary;
}
