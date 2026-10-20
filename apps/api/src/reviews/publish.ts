// Publishing a book review or its removal (Story 99 / ADR 0089 §4): Unbnd's
// relay first, which gates the response; then, without waiting, the writer's
// own write relays and the review set. Never the hub, which refuses reviews:
// the relay sync re-sends to the index if this background publish fails.
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { PublishResult } from "../nostr/publish";
import { REVIEW_RELAYS } from "./read";

const isHub = (url: string) => /^wss:\/\/dcosl\.brainstorm\.world\/?$/.test(url);

export function makeReviewPublisher(deps: {
  readonly local: (event: SignedNostrEvent) => Promise<PublishResult>;
  readonly fanout: (relays: readonly string[], event: SignedNostrEvent) => Promise<unknown>;
  /** The writer's NIP-65 write relays; empty for a key Unbnd holds. */
  readonly writeRelaysOf: (pubkey: string) => Promise<readonly string[]>;
  readonly onError?: (reason: string) => void;
}): (event: SignedNostrEvent) => Promise<PublishResult> {
  return async (event) => {
    const local = await deps.local(event);
    if (!local.ok) return local;
    void (async () => {
      const own = await deps.writeRelaysOf(event.pubkey).catch(() => [] as readonly string[]);
      const extra = [...new Set(own.map((u) => u.replace(/\/$/, "")))].filter(
        (u) => !isHub(u) && !REVIEW_RELAYS.includes(u),
      );
      await deps.fanout([...extra, ...REVIEW_RELAYS], event);
    })().catch((err) => deps.onError?.(err instanceof Error ? err.message : String(err)));
    return local;
  };
}
