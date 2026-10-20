// The book review record (Story 99 / ADR 0089): kind 34259 with the mark
// `book`, the record Brainstorm and Unbnd share under the books actions
// contract (Brainstorm-UI docs/dictionary/books-actions.md, after the places
// contract). How a review is built, edited and removed, and how its stars,
// words and book are read. Which reviews stand is @unbnd/trust's job.

export const BOOK_REVIEW_KIND = 34259;
export const BOOK_REVIEW_MARK = "book";
/** The list hub, given only as the relay hint on `a`: it refuses reviews. */
export const REVIEW_HUB = "wss://dcosl.brainstorm.world";
export const BOOK_REVIEW_WORDS_MAX = 1200;

type Tagged = { readonly tags: ReadonlyArray<readonly string[]> };

export type ReviewTemplate = {
  kind: number;
  created_at: number;
  tags: string[][];
  content: string;
};

/** A review Unbnd is about to replace: the parts the edit rule reads. */
export type PreviousReview = {
  readonly id: string;
  readonly created_at: number;
  readonly content: string;
  readonly tags: ReadonlyArray<readonly string[]>;
};

const BOOK_ADDRESS = /^39999:[0-9a-f]{64}:[^:\s]+$/;
const ANY_ADDRESS = /^\d+:[0-9a-f]{64}:/;
/** Tags this app sets on every version, and tags that belong to one signing. */
const NOT_CARRIED = new Set(["d", "a", "m", "rating", "s", "alt", "client", "nonce"]);

function imetaUrls(e: Tagged): string[] {
  const urls: string[] = [];
  for (const t of e.tags) {
    if (t[0] !== "imeta") continue;
    for (const part of t.slice(1)) {
      if (part.startsWith("url ")) urls.push(part.slice(4).trim());
    }
  }
  return urls.filter(Boolean);
}

/**
 * A new review, or an edit of `previous`: dated `max(now, previous + 1)`,
 * every tag this app does not set carried over in order (contract §6), and a
 * carried photo's address kept after the words.
 */
export function buildBookReviewTemplate(input: {
  readonly bookAddress: string;
  readonly title: string;
  readonly stars: number;
  readonly words: string;
  readonly now: number;
  readonly previous?: PreviousReview;
}): ReviewTemplate {
  const { bookAddress, title, stars, now, previous } = input;
  if (!BOOK_ADDRESS.test(bookAddress)) throw new Error(`book review: not a book address: ${bookAddress}`);
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) throw new Error("book review: stars must be 1 to 5");
  const words = input.words.trim();
  if (words.length > BOOK_REVIEW_WORDS_MAX) {
    throw new Error(`book review: words run past ${BOOK_REVIEW_WORDS_MAX} characters`);
  }

  const carried = (previous?.tags ?? []).filter((t) => !NOT_CARRIED.has(t[0] ?? "")).map((t) => [...t]);
  const photos = imetaUrls({ tags: carried }).filter((url) => !words.includes(url));
  const content = [words, ...photos].filter((line) => line !== "").join("\n");

  return {
    kind: BOOK_REVIEW_KIND,
    created_at: previous ? Math.max(now, previous.created_at + 1) : now,
    content,
    tags: [
      ["d", `book:${bookAddress}`],
      ["a", bookAddress, REVIEW_HUB],
      ["m", BOOK_REVIEW_MARK],
      ["rating", (stars / 5).toFixed(3)],
      ["s", String(stars)],
      ["alt", `Review of ${title}: ${stars} of 5 stars`],
      ...carried,
    ],
  };
}

/** A NIP-09 removal naming the review by id and by address (contract §6). */
export function buildBookReviewRemoval(
  review: { readonly id: string; readonly pubkey: string; readonly d: string },
  now: number,
): ReviewTemplate {
  return {
    kind: 5,
    created_at: now,
    content: "",
    tags: [
      ["e", review.id],
      ["a", `${BOOK_REVIEW_KIND}:${review.pubkey}:${review.d}`],
      ["k", String(BOOK_REVIEW_KIND)],
    ],
  };
}

/**
 * The stars a review gives, by Brainstorm's rule (`client/src/lib/thing.ts`):
 * a whole `s` from 1 to 5 first; else the aspect-free `rating`, from above 0
 * up to 1 a fraction of five stars, above 1 up to 5 stars. A rating of 0, and
 * anything else, is no stars, never zero.
 */
export function starsOf(e: Tagged): number | null {
  const s = Number(e.tags.find((t) => t[0] === "s")?.[1]);
  if (Number.isInteger(s) && s >= 1 && s <= 5) return s;
  const overall =
    e.tags.find((t) => t[0] === "rating" && t[1] && !t[2]) ?? e.tags.find((t) => t[0] === "rating");
  const raw = Number(overall?.[1]);
  if (!overall?.[1] || !Number.isFinite(raw) || raw <= 0) return null;
  if (raw <= 1) return Math.round(raw * 5 * 1000) / 1000;
  if (raw <= 5) return raw;
  return null;
}

/** The person's words: the content without the photo addresses, trimmed. */
export function wordsOf(e: Tagged & { readonly content: string }): string {
  let words = e.content;
  for (const url of imetaUrls(e)) words = words.split(url).join("");
  return words.trim();
}

/** The address a review names: its `a`, else its `d` with or without `book:`. */
export function reviewedAddressOf(e: Tagged): string | null {
  const a = e.tags.find((t) => t[0] === "a")?.[1];
  if (a) return a;
  const d = e.tags.find((t) => t[0] === "d")?.[1];
  if (!d) return null;
  const bare = d.startsWith("book:") ? d.slice("book:".length) : d;
  return ANY_ADDRESS.test(bare) ? bare : null;
}
