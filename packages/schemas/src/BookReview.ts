// STUB (red): Story 99 / ADR 0089.
export const BOOK_REVIEW_KIND = 0 as number;
export const BOOK_REVIEW_WORDS_MAX = 0 as number;
export const REVIEW_HUB = "" as string;
type Tagged = { readonly tags: ReadonlyArray<readonly string[]> };
export type ReviewTemplate = { kind: number; created_at: number; tags: string[][]; content: string };
export function buildBookReviewTemplate(_i: {
  bookAddress: string; title: string; stars: number; words: string; now: number;
  previous?: { id: string; created_at: number; content: string; tags: ReadonlyArray<readonly string[]> };
}): ReviewTemplate { throw new Error("stub"); }
export function buildBookReviewRemoval(_r: { id: string; pubkey: string; d: string }, _now: number): ReviewTemplate { throw new Error("stub"); }
export function starsOf(_e: Tagged): number | null { throw new Error("stub"); }
export function wordsOf(_e: Tagged & { readonly content: string }): string { throw new Error("stub"); }
export function reviewedAddressOf(_e: Tagged): string | null { throw new Error("stub"); }
