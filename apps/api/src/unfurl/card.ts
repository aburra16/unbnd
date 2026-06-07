// The unfurl card model + renderers (Story 72 / ADR 0070). PURE — no I/O, no
// relay, no trust seam. Given a book, its RAW rating summary, and its RAW tag
// consensus, it produces a viewer-independent card and the two wire artifacts a
// link-unfurling crawler consumes: an Open Graph / Twitter HTML document and an
// oEmbed JSON payload. Raw only by construction (no observer is ever passed in),
// which is the honest choice for an unfurl: there is no viewer to weight for.
//
// STUB (Test Design phase): signatures are final; bodies are placeholders so the
// red tests compile and fail. Real logic lands in Implementation.
import type { PublicBook } from "../books/effective";
import type { RawBookTags } from "../tags/aggregate";

/** The raw, viewer-independent rating summary (from `rawFromParsed`). */
export type RawRatingSummary = { readonly count: number; readonly average: number | null };

/** The render-ready, viewer-independent card. `ratingLabel`/`coverUrl` are null
 * when honestly absent (no ratings yet / no cover). */
export type BookCard = {
  readonly slug: string;
  readonly title: string;
  readonly authorName: string;
  readonly coverUrl: string | null;
  readonly ratingLabel: string | null;
  readonly topTags: string[];
  readonly canonicalUrl: string;
};

/** Compose the card from a book + its raw rating + raw tag consensus. */
export function buildBookCard(
  _book: PublicBook,
  _raw: RawRatingSummary,
  _tags: RawBookTags,
  _baseUrl: string,
): BookCard {
  // STUB.
  return {
    slug: "",
    title: "",
    authorName: "",
    coverUrl: null,
    ratingLabel: null,
    topTags: [],
    canonicalUrl: "",
  };
}

/** The per-book unfurl HTML document (OG + Twitter tags + oEmbed discovery). */
export function renderUnfurlHtml(_card: BookCard, _baseUrl: string): string {
  // STUB.
  return "";
}

/** The generic site card served when a slug resolves to no catalog book — never
 * a fabricated book card (AC-6). */
export function renderGenericHtml(_baseUrl: string): string {
  // STUB.
  return "";
}

/** The oEmbed 1.0 `link` payload for the card (auto-discovery). */
export function toOEmbed(
  _card: BookCard,
  _opts: { maxwidth?: number; maxheight?: number } = {},
): Record<string, unknown> {
  // STUB.
  return {};
}
