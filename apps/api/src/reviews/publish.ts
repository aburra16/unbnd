// STUB (red): Story 99.
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { PublishResult } from "../nostr/publish";
export function makeReviewPublisher(_d: {
  local: (e: SignedNostrEvent) => Promise<PublishResult>;
  fanout: (relays: readonly string[], e: SignedNostrEvent) => Promise<unknown>;
  writeRelaysOf: (pubkey: string) => Promise<readonly string[]>;
}): (e: SignedNostrEvent) => Promise<PublishResult> { throw new Error("stub"); }
