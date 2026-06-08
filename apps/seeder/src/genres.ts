// Genre derivation from a book's preserved Open Library subjects (Story 75 /
// ADR 0073). PURE — no relay, no fetch. Shared by the seed path and the no-fetch
// recast so freshly-seeded books and recast books get the same genres.
import {
  buildBookTagAssertionsHeaderAddress,
  type BookTagAssertion,
  type HexPubkey,
} from "@unbnd/schemas";

// Per-genre keyword patterns matched (lowercased substring) against a book's OL
// subjects. Precision-favoring: genre is a revisable assertion, so a curator can
// always add what the rules miss. `science-fiction` is handled separately (it
// must not leak into `science` or the `literary-fiction` fallback).
const RULES: ReadonlyArray<{ genre: string; patterns: readonly string[] }> = [
  { genre: "young-adult", patterns: ["young adult", "juvenile fiction", "juvenile literature"] },
  { genre: "graphic-novels", patterns: ["comic", "graphic novel", "cartoons", "manga"] },
  { genre: "mystery", patterns: ["mystery", "detective", "crime"] },
  { genre: "thriller", patterns: ["thriller", "suspense"] },
  { genre: "romance", patterns: ["romance", "love stories"] },
  { genre: "fantasy", patterns: ["fantasy"] },
  { genre: "horror", patterns: ["horror"] },
  { genre: "science", patterns: ["science", "physics", "biology", "chemistry", "mathematics", "astronomy"] },
  { genre: "philosophy", patterns: ["philosophy"] },
  { genre: "history", patterns: ["history", "historical"] },
  { genre: "biography", patterns: ["biography"] },
  { genre: "memoir", patterns: ["memoir", "autobiograph"] },
  { genre: "poetry", patterns: ["poetry", "poems"] },
  { genre: "self-help", patterns: ["self-help", "self help", "personal development"] },
];

const SCI_FI_MARKERS = ["science fiction", "sci-fi"] as const;

// Match a keyword at a WORD BOUNDARY (a leading `\b`, suffixes allowed) rather
// than a raw substring, so a pattern only matches whole-word: "science" matches
// "Science"/"Social science"/"Sciences" but NOT "conscience"; "fiction" matches
// "Fiction" but NOT "Nonfiction". This kills the mid-word false-positive class.
const boundary = (pattern: string): RegExp =>
  new RegExp("\\b" + pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");

const RULE_RES: ReadonlyArray<{ genre: string; res: readonly RegExp[] }> = RULES.map((r) => ({
  genre: r.genre,
  res: r.patterns.map(boundary),
}));
const SCI_FI_RES = SCI_FI_MARKERS.map(boundary);
const FICTION_RE = boundary("fiction");

/**
 * Map a book's preserved OL subject strings to genre slugs. Deterministic,
 * multi-genre, precision-favoring (word-boundary matched). Returns [] when
 * nothing matches (the book is simply unsorted — no fabricated genre).
 * `literary-fiction` is a FALLBACK: assigned only when a fiction marker is
 * present and no other genre matched.
 */
export function subjectsToGenres(subjects: readonly string[]): string[] {
  const matched = new Set<string>();
  let fictionMarker = false;
  for (const raw of subjects) {
    if (FICTION_RE.test(raw)) fictionMarker = true;
    // A science-fiction subject is ONLY science-fiction (not science/literary).
    if (SCI_FI_RES.some((re) => re.test(raw))) {
      matched.add("science-fiction");
      continue;
    }
    for (const { genre, res } of RULE_RES) {
      if (res.some((re) => re.test(raw))) matched.add(genre);
    }
  }
  // Fiction fallback: a fiction book with no more-specific genre is literary.
  if (fictionMarker && matched.size === 0) matched.add("literary-fiction");
  return [...matched];
}

/**
 * The librarian genre assertions to publish for one catalog record during the
 * recast: one per derived genre, librarian-authored (so re-running replaces by
 * d-tag — idempotent — and never touches curator/user assertions).
 */
export function buildRecastAssertions(
  record: { slug: string; subjects?: readonly string[] },
  librarian: HexPubkey,
): BookTagAssertion[] {
  const genres = subjectsToGenres(record.subjects ?? []);
  const parentHeader = buildBookTagAssertionsHeaderAddress(librarian);
  return genres.map((genre) => ({
    bookSlug: record.slug,
    bookAddress: { kind: 39999, pubkey: librarian, dTag: record.slug },
    tagSlug: genre,
    tagType: "genre",
    polarity: 1,
    asserterPubkey: librarian,
    parentHeader,
  }));
}
