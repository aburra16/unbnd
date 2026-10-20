// The review sync (Story 99 / ADR 0089 §5). Pulls book reviews and their
// removals from the review set into Unbnd's relay, so reviews written in other
// apps reach every read here; then re-sends Unbnd's own recent reviews and
// removals to the index, the backstop for a background publish that failed.
import {
  BOOK_REVIEW_KIND,
  BOOK_REVIEW_MARK,
  reviewedAddressOf,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { NostrFilter } from "../nostr/query";
import type { PublishResult } from "../nostr/publish";
import { REVIEW_RELAYS } from "./read";

const INDEX = "wss://search.brainstorm.world";
const PUSH_WINDOW_SECONDS = 2 * 86_400;

export type ReviewSyncDeps = {
  readonly librarian: string;
  /** Pull events newer than this (the caller keeps the watermark). */
  readonly since: number;
  readonly now: number;
  readonly pull: (url: string, filter: NostrFilter & { search?: string }) => Promise<SignedNostrEvent[]>;
  readonly verify: (event: SignedNostrEvent) => boolean;
  readonly writeLocal: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly readLocal: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  readonly push: (relays: readonly string[], event: SignedNostrEvent) => Promise<unknown>;
};

/** A review of a catalog book, or a removal naming a book review by address. */
function belongs(e: SignedNostrEvent, librarian: string): boolean {
  if (e.kind === BOOK_REVIEW_KIND) return reviewedAddressOf(e)?.startsWith(`39999:${librarian}:`) ?? false;
  if (e.kind === 5) {
    return e.tags.some(
      (t) => t[0] === "a" && t[1]?.startsWith(`${BOOK_REVIEW_KIND}:${e.pubkey}:book:39999:${librarian}:`),
    );
  }
  return false;
}

export async function runReviewSyncCycle(
  deps: ReviewSyncDeps,
): Promise<{ pulled: number; written: number; pushed: number }> {
  const seen = new Map<string, SignedNostrEvent>();
  for (const url of REVIEW_RELAYS) {
    const token = url === INDEX ? { search: "include:spam" } : {};
    const filters: Array<NostrFilter & { search?: string }> = [
      { kinds: [BOOK_REVIEW_KIND], "#m": [BOOK_REVIEW_MARK], since: deps.since, ...token },
      { kinds: [5], "#k": [String(BOOK_REVIEW_KIND)], since: deps.since, ...token },
    ];
    for (const filter of filters) {
      const events = await deps.pull(url, filter).catch(() => [] as SignedNostrEvent[]);
      for (const e of events) seen.set(e.id, e);
    }
  }

  // A removal naming a review by id alone belongs when that id is a book review
  // Unbnd holds, by the same author (contract §6: an `e` alone takes it down).
  const idOnly = [...seen.values()].filter((e) => e.kind === 5 && !belongs(e, deps.librarian));
  const named = [...new Set(idOnly.flatMap((e) => e.tags.filter((t) => t[0] === "e" && t[1]).map((t) => t[1]!)))];
  const held = named.length > 0 ? await deps.readLocal({ kinds: [BOOK_REVIEW_KIND], ids: named }) : [];
  const heldBy = new Map(held.map((r) => [r.id, r.pubkey]));
  const keep = (e: SignedNostrEvent) =>
    belongs(e, deps.librarian) ||
    (e.kind === 5 && e.tags.some((t) => t[0] === "e" && t[1] !== undefined && heldBy.get(t[1]) === e.pubkey));

  let written = 0;
  for (const e of seen.values()) {
    if (!keep(e) || !deps.verify(e)) continue;
    const r = await deps.writeLocal(e);
    if (r.ok) written++;
  }

  const recent = await deps.readLocal({ kinds: [BOOK_REVIEW_KIND, 5], since: deps.now - PUSH_WINDOW_SECONDS });
  let pushed = 0;
  const recentReviews = new Map(recent.filter((e) => e.kind === BOOK_REVIEW_KIND).map((r) => [r.id, r.pubkey]));
  for (const e of recent) {
    const ours =
      belongs(e, deps.librarian) ||
      (e.kind === 5 && e.tags.some((t) => t[0] === "e" && t[1] !== undefined && recentReviews.get(t[1]) === e.pubkey));
    if (!ours) continue;
    await deps.push([INDEX], e);
    pushed++;
  }
  return { pulled: seen.size, written, pushed };
}

/**
 * Run the sync on an unref'd, fault-isolated timer (like the maintenance
 * sweeper). The watermark starts seven days back and then trails each cycle's
 * start by ten minutes, so an event that lands mid-cycle is pulled next time.
 */
export function startReviewSync(opts: {
  readonly intervalMs: number;
  readonly cycle: (since: number, now: number) => Promise<{ pulled: number; written: number; pushed: number }>;
  readonly log?: (message: string) => void;
}): { stop: () => void } {
  if (opts.intervalMs <= 0) return { stop: () => {} };
  let since = Math.floor(Date.now() / 1000) - 7 * 86_400;
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    const now = Math.floor(Date.now() / 1000);
    try {
      const r = await opts.cycle(since, now);
      since = now - 600;
      if (r.written > 0) opts.log?.(`[review-sync] pulled ${r.pulled}, wrote ${r.written}, pushed ${r.pushed}`);
    } catch (err) {
      opts.log?.(`[review-sync] cycle failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), opts.intervalMs);
  timer.unref();
  void tick();
  return { stop: () => clearInterval(timer) };
}
