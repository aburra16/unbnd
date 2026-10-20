// STUB (red): Story 99.
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { NostrFilter } from "../nostr/query";
export const REVIEW_RELAYS: readonly string[] = [];
export type ReviewScope = { book: string } | { authors: string[] } | { all: true };
export async function readBookReviews(_q: (f: NostrFilter) => Promise<SignedNostrEvent[]>, _s: ReviewScope): Promise<SignedNostrEvent[]> { throw new Error("stub"); }
