// Story 65 / ADR 0064 — pure, observer-relative taste-match metric over two
// users' book ratings. v1 = raw rating agreement (inverse mean rating-distance):
// over the books BOTH have rated, agreement = 1 - mean(|a - b|) / 4, scaled to
// 0-100. Defined for any overlap >= 1; below `minOverlap` the percentage is
// withheld (honest "not enough overlap yet"). No trust weighting in v1 — that is
// a later story. Pure, no I/O; reused by the profile endpoint and (later) the
// book-detail bylines.

export type TasteMatch = {
  /** How many books both users have rated (the intersection size). */
  readonly commonBooks: number;
  /** True when `commonBooks >= minOverlap`. `percentage` is present iff true. */
  readonly thresholdMet: boolean;
  /** 0-100 agreement, present only when the overlap threshold is met. */
  readonly percentage?: number;
};

/** The widest rating distance on the 1-5 scale (5 - 1), the denominator. */
const MAX_DISTANCE = 4;

/**
 * Compute the taste match between an observer and a target from their book
 * ratings (maps of book identifier -> score 1..5). v1 raw agreement.
 */
export function computeTasteMatch(
  observerScores: ReadonlyMap<string, number>,
  targetScores: ReadonlyMap<string, number>,
  minOverlap: number,
): TasteMatch {
  let sumAbsDiff = 0;
  let commonBooks = 0;
  for (const [book, observerScore] of observerScores) {
    const targetScore = targetScores.get(book);
    if (targetScore === undefined) continue; // only co-rated books count
    sumAbsDiff += Math.abs(observerScore - targetScore);
    commonBooks += 1;
  }

  if (commonBooks < minOverlap) {
    return { commonBooks, thresholdMet: false };
  }

  const meanAbsDiff = sumAbsDiff / commonBooks;
  const raw = Math.round((1 - meanAbsDiff / MAX_DISTANCE) * 100);
  const percentage = Math.max(0, Math.min(100, raw)); // defensive clamp; scores are 1-5
  return { commonBooks, thresholdMet: true, percentage };
}
