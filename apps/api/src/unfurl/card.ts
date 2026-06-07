// The unfurl card model + renderers (Story 72 / ADR 0070). PURE — no I/O, no
// relay, no trust seam. Given a book, its RAW rating summary, and its RAW tag
// consensus, it produces a viewer-independent card and the two wire artifacts a
// link-unfurling crawler consumes: an Open Graph / Twitter HTML document and an
// oEmbed JSON payload. Raw only by construction (no observer is ever passed in),
// which is the honest choice for an unfurl: there is no viewer to weight for.
import type { PublicBook } from "../books/effective";
import type { RawBookTags, RawTagConsensus } from "../tags/aggregate";

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

const PROVIDER = "Unbnd";
const FALLBACK_OG_IMAGE = "/og-image-1200.png";
const SITE_DESCRIPTION = "Book discovery weighted by the readers and curators you trust.";
const TOP_TAGS = 3;
// Category rank for the tie-break: genres lead, then styles, then signals.
const CATEGORY_RANK: Record<RawTagConsensus["type"], number> = { genre: 0, style: 1, signal: 2 };

/** Escape text for an HTML text node. `&` first so we never double-escape. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Escape a value placed inside a double-quoted HTML attribute. */
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Top N net-positive tags across all categories, ranked by net consensus. */
function selectTopTags(tags: RawBookTags): string[] {
  const all: RawTagConsensus[] = [...tags.genres, ...tags.styles, ...tags.signals];
  return all
    .map((t) => ({ name: t.name, net: t.applies - t.disputes, rank: CATEGORY_RANK[t.type] }))
    .filter((t) => t.net > 0)
    .sort((a, b) => b.net - a.net || a.rank - b.rank || a.name.localeCompare(b.name))
    .slice(0, TOP_TAGS)
    .map((t) => t.name);
}

/** Compose the card from a book + its raw rating + raw tag consensus. */
export function buildBookCard(
  book: PublicBook,
  raw: RawRatingSummary,
  tags: RawBookTags,
  baseUrl: string,
): BookCard {
  const ratingLabel =
    raw.count > 0 && raw.average !== null
      ? `★ ${raw.average.toFixed(1)} · ${raw.count} ${raw.count === 1 ? "rating" : "ratings"}`
      : null;
  return {
    slug: book.slug,
    title: book.title,
    authorName: book.authorName,
    coverUrl: book.coverUrl ?? null,
    ratingLabel,
    topTags: selectTopTags(tags),
    canonicalUrl: `${baseUrl}/book/${book.slug}`,
  };
}

/** The og:description line: author, then rating (when present), then tags. */
function cardDescription(card: BookCard): string {
  const parts = [card.authorName];
  if (card.ratingLabel) parts.push(card.ratingLabel);
  if (card.topTags.length > 0) parts.push(card.topTags.join(", "));
  return parts.join(" · ");
}

function htmlDocument(headTags: string[], bodyText: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
${headTags.join("\n")}
</head>
<body>
<main>${escapeHtml(bodyText)}</main>
</body>
</html>
`;
}

/** The per-book unfurl HTML document (OG + Twitter tags + oEmbed discovery). */
export function renderUnfurlHtml(card: BookCard, baseUrl: string): string {
  const ogImage = card.coverUrl ?? `${baseUrl}${FALLBACK_OG_IMAGE}`;
  const description = cardDescription(card);
  const oembedHref = `${baseUrl}/api/oembed?url=${encodeURIComponent(card.canonicalUrl)}`;
  const head = [
    `<title>${escapeHtml(card.title)} — ${PROVIDER}</title>`,
    `<meta property="og:title" content="${escapeAttr(card.title)}">`,
    `<meta property="og:description" content="${escapeAttr(description)}">`,
    `<meta property="og:image" content="${escapeAttr(ogImage)}">`,
    `<meta property="og:url" content="${escapeAttr(card.canonicalUrl)}">`,
    `<meta property="og:type" content="book">`,
    `<meta property="og:site_name" content="${PROVIDER}">`,
    `<meta name="twitter:card" content="${card.coverUrl ? "summary_large_image" : "summary"}">`,
    `<meta name="twitter:title" content="${escapeAttr(card.title)}">`,
    `<meta name="twitter:description" content="${escapeAttr(description)}">`,
    `<meta name="twitter:image" content="${escapeAttr(ogImage)}">`,
    `<link rel="canonical" href="${escapeAttr(card.canonicalUrl)}">`,
    `<link rel="alternate" type="application/json+oembed" href="${escapeAttr(oembedHref)}" title="${escapeAttr(card.title)}">`,
  ];
  return htmlDocument(head, `${card.title} by ${card.authorName}`);
}

/** The generic site card served when a slug resolves to no catalog book — never
 * a fabricated book card (AC-6). Carries no og:type (it is not a book). */
export function renderGenericHtml(baseUrl: string): string {
  const head = [
    `<title>${PROVIDER}</title>`,
    `<meta name="description" content="${escapeAttr(SITE_DESCRIPTION)}">`,
    `<meta property="og:title" content="${PROVIDER}">`,
    `<meta property="og:description" content="${escapeAttr(SITE_DESCRIPTION)}">`,
    `<meta property="og:image" content="${escapeAttr(`${baseUrl}${FALLBACK_OG_IMAGE}`)}">`,
    `<meta property="og:site_name" content="${PROVIDER}">`,
    `<meta name="twitter:card" content="summary">`,
  ];
  return htmlDocument(head, PROVIDER);
}

/** The oEmbed 1.0 `link` payload for the card (auto-discovery). `type: "link"`
 * — never `rich` — so no embeddable HTML, hence no injection surface. */
export function toOEmbed(
  card: BookCard,
  _opts: { maxwidth?: number; maxheight?: number } = {},
): Record<string, unknown> {
  let providerUrl: string | undefined;
  try {
    providerUrl = new URL(card.canonicalUrl).origin;
  } catch {
    providerUrl = undefined;
  }
  return {
    version: "1.0",
    type: "link",
    title: card.title,
    author_name: card.authorName,
    provider_name: PROVIDER,
    provider_url: providerUrl,
    thumbnail_url: card.coverUrl ?? undefined,
    rating: card.ratingLabel ?? undefined,
    tags: card.topTags,
  };
}
