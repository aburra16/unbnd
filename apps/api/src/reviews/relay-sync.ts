// STUB (red): Story 99.
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { NostrFilter } from "../nostr/query";
import type { PublishResult } from "../nostr/publish";
export type ReviewSyncDeps = {
  librarian: string; since: number; now: number;
  pull: (url: string, filter: NostrFilter & { search?: string }) => Promise<SignedNostrEvent[]>;
  verify: (e: SignedNostrEvent) => boolean;
  writeLocal: (e: SignedNostrEvent) => Promise<PublishResult>;
  readLocal: (filter: NostrFilter) => Promise<SignedNostrEvent[]>;
  push: (relays: readonly string[], e: SignedNostrEvent) => Promise<unknown>;
};
export async function runReviewSyncCycle(_d: ReviewSyncDeps): Promise<{ pulled: number; written: number; pushed: number }> { throw new Error("stub"); }
