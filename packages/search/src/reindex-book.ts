// Shared best-effort "reindex this book" helper (Story 60 / ADR 0059 §2, §7).
// BOTH the API tags hook and the promoter hook call this. It does a scoped
// per-book read → buildBookDocument → single-doc upsert through the neutral
// SearchProvider, and NEVER throws to its caller (best-effort, mirrors
// withUpSync): every failure is logged `[index-on-write] …` and swallowed; the
// durable relay publish (API) / markDone (promoter) is the contract, never
// gated on the index write. A junk/missing/demoted book (buildBookDocument
// null) is a skip — NO upsert AND NO delete (the provider has no single-doc
// delete; stale-row removal is the batch rebuild's job, ADR 0059 Q6). RAW
// consensus only — no trust at index time (CLAUDE.md invariant #3).
import type { SignedNostrEvent } from "@unbnd/schemas";
import { buildBookDocument } from "./build-document";
import type { SearchProvider } from "./types";

/** Scoped per-book relay read: this book's record, the taxonomy, and THIS
 * book's assertions (#a-scoped). Injected so the helper is unit-testable with a
 * fake and so the API/promoter each supply their own relay reader (ADR 0059 §3). */
export type BookReader = (bookSlug: string) => Promise<{
  bookEvent: SignedNostrEvent | null;
  taxonomyEvents: SignedNostrEvent[];
  assertionEvents: SignedNostrEvent[];
}>;

/**
 * Best-effort single-book reindex. Reads the book's inputs, rebuilds its doc via
 * the shared `buildBookDocument`, and upserts it through `provider.index`. Never
 * throws: a read failure or a provider rejection is logged + swallowed. A null
 * build result (junk/missing/demoted) issues no upsert and no delete.
 */
export async function reindexBook(
  provider: SearchProvider,
  read: BookReader,
  bookSlug: string,
  currentYear: number,
): Promise<void> {
  try {
    const { bookEvent, taxonomyEvents, assertionEvents } = await read(bookSlug);
    if (!bookEvent) return; // nothing to index (missing record)
    const doc = buildBookDocument(bookEvent, taxonomyEvents, assertionEvents, currentYear);
    if (!doc) return; // junk/demoted → skip (Q6): no upsert, no delete
    await provider.index([doc]);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn(
      `[index-on-write] reindex ${bookSlug} failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }
}
