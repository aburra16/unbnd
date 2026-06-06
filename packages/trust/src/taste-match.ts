// Story 65 / ADR 0064 — pure, observer-relative taste-match metric over two
// users' book ratings. v1 = raw rating agreement (inverse mean rating-distance):
// over the books BOTH have rated, agreement = 1 - mean(|a - b|) / 4, scaled to
// 0-100. Defined for any overlap >= 1; below `minOverlap` the percentage is
// withheld (honest "not enough overlap yet"). No trust weighting in v1 — that is
// a later story. Pure, no I/O; reused by the profile endpoint and (later) the
// book-detail bylines.
//
// STUB (red): the real metric lands in implementation.

export type TasteMatch = {
  /** How many books both users have rated (the intersection size). */
  readonly commonBooks: number;
  /** True when `commonBooks >= minOverlap`. `percentage` is present iff true. */
  readonly thresholdMet: boolean;
  /** 0-100 agreement, present only when the overlap threshold is met. */
  readonly percentage?: number;
};

/**
 * Compute the taste match between an observer and a target from their book
 * ratings (maps of book identifier -> score 1..5). v1 raw agreement.
 */
export function computeTasteMatch(
  _observerScores: ReadonlyMap<string, number>,
  _targetScores: ReadonlyMap<string, number>,
  _minOverlap: number,
): TasteMatch {
  throw new Error("computeTasteMatch: not implemented (Story 65)");
}
