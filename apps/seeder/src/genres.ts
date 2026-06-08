// Genre derivation from a book's preserved Open Library subjects (Story 75 /
// ADR 0073). PURE — no relay, no fetch. Shared by the seed path and the no-fetch
// recast so freshly-seeded books and recast books get the same genres.
//
// STUB (Test Design phase): signatures are final; bodies are placeholders so the
// red tests compile and fail. The real rule table + precedence land in
// Implementation.
import {
  buildBookTagAssertionsHeaderAddress,
  type BookTagAssertion,
  type HexPubkey,
} from "@unbnd/schemas";

/**
 * Map a book's preserved OL subject strings to genre slugs. Deterministic,
 * multi-genre, precision-favoring (genre is a revisable assertion). Returns []
 * when nothing matches (the book is simply unsorted — no fabricated genre).
 */
export function subjectsToGenres(_subjects: readonly string[]): string[] {
  // STUB.
  return [];
}

/**
 * The librarian genre assertions to publish for one catalog record during the
 * recast: one per derived genre, librarian-authored (so re-running replaces by
 * d-tag — idempotent — and never touches curator/user assertions).
 */
export function buildRecastAssertions(
  _record: { slug: string; subjects?: readonly string[] },
  _librarian: HexPubkey,
): BookTagAssertion[] {
  // STUB. (References the header builder so the import is real.)
  void buildBookTagAssertionsHeaderAddress;
  return [];
}
