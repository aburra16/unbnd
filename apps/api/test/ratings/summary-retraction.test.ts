// FAILING TESTS — Story 79 / ADR 0077 (the own-scoped folds, seams 3–5).
//
// Every own-scoped rating fold must apply the same rule as dedupeRatings:
// admit retractions into the latest-wins race over its key; a retracted head
// means no current rating for that key. Seam 3: profile counts
// (countOwnRatings). Seam 4: For-You exclusion (ownRatedSlugs — a removed
// book becomes recommendable again). Seam 5: taste-match (scoreBySlug /
// scoresByAuthor).
import { describe, expect, it } from "vitest";
import { generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  countOwnRatings,
  ownRatedSlugs,
  scoreBySlug,
  scoresByAuthor,
} from "../../src/ratings/summary";
import { signedRating, signedRetraction } from "./_fixtures";

describe("countOwnRatings — seam 3 (profile counts)", () => {
  it("a retracted rating drops out of booksRated AND reviews", () => {
    const sk = generateSecretKey();
    const rated = signedRating({
      sk,
      bookSlug: "orbital",
      reviewText: "A quiet marvel.",
      createdAt: 100,
    });
    const retracted = signedRetraction({ sk, bookSlug: "orbital", createdAt: 200 });
    const kept = signedRating({ sk, bookSlug: "piranesi", createdAt: 100 });

    const counts = countOwnRatings([rated.event, retracted.event, kept.event]);
    expect(counts.booksRated).toBe(1); // only piranesi
    expect(counts.reviews).toBe(0); // the reviewed book was the retracted one
  });

  it("re-rating after a retraction counts again (restore by re-rate)", () => {
    const sk = generateSecretKey();
    const events = [
      signedRating({ sk, bookSlug: "orbital", createdAt: 100 }).event,
      signedRetraction({ sk, bookSlug: "orbital", createdAt: 200 }).event,
      signedRating({ sk, bookSlug: "orbital", createdAt: 300 }).event,
    ];
    expect(countOwnRatings(events).booksRated).toBe(1);
  });
});

describe("ownRatedSlugs — seam 4 (For-You exclusion)", () => {
  it("a retracted book leaves the rated set, so For-You can recommend it again", () => {
    const sk = generateSecretKey();
    const slugs = ownRatedSlugs([
      signedRating({ sk, bookSlug: "orbital", createdAt: 100 }).event,
      signedRetraction({ sk, bookSlug: "orbital", createdAt: 200 }).event,
      signedRating({ sk, bookSlug: "piranesi", createdAt: 100 }).event,
    ]);
    expect(slugs.has("orbital")).toBe(false);
    expect(slugs.has("piranesi")).toBe(true);
    expect(slugs.size).toBe(1);
  });
});

describe("scoreBySlug / scoresByAuthor — seam 5 (taste-match)", () => {
  it("scoreBySlug drops a retracted head and keeps a re-rated one", () => {
    const sk = generateSecretKey();
    const scores = scoreBySlug([
      signedRating({ sk, bookSlug: "orbital", score: 4, createdAt: 100 }).event,
      signedRetraction({ sk, bookSlug: "orbital", createdAt: 200 }).event,
      signedRating({ sk, bookSlug: "piranesi", score: 5, createdAt: 100 }).event,
      signedRetraction({ sk, bookSlug: "piranesi", createdAt: 200 }).event,
      signedRating({ sk, bookSlug: "piranesi", score: 3, createdAt: 300 }).event,
    ]);
    expect(scores.has("orbital")).toBe(false);
    expect(scores.get("piranesi")).toBe(3);
  });

  it("scoresByAuthor drops only the retracting author's entry for that book", () => {
    const skA = generateSecretKey();
    const skB = generateSecretKey();
    const byAuthor = scoresByAuthor([
      signedRating({ sk: skA, bookSlug: "orbital", score: 5, createdAt: 100 }).event,
      signedRating({ sk: skB, bookSlug: "orbital", score: 2, createdAt: 100 }).event,
      signedRetraction({ sk: skA, bookSlug: "orbital", createdAt: 200 }).event,
    ]);
    expect(byAuthor.get(getPublicKey(skA))?.has("orbital") ?? false).toBe(false);
    expect(byAuthor.get(getPublicKey(skB))?.get("orbital")).toBe(2);
  });
});
