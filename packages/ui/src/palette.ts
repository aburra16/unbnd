// packages/ui/src/palette.ts — the single source of color truth for the
// genre/cover palette (ADR 0040 §3, Option B). Order is load-bearing: Avatar
// and the cover gradient index into it by hash(seed) % length, so reordering
// would re-color books and avatars and break the Story-39 visual gate.
//
// The CSS `--u-raw-color-genre-<name>` tokens in tokens.css are bound to each
// named row's `bg` by packages/ui/test/architecture-palette-sync.test.ts, so
// the TS source and the CSS raws cannot drift apart. The `ink` partners and
// `coverTo` stops live ONLY here (their only consumers are the runtime-injected
// JS paths in Avatar.tsx and view-model.ts; minting CSS tokens whose sole
// reader is JS reading them back would be dead CSS — ADR 0040 §3).
//
// The eighth row carries `genre: null` (the teal hue with no genre token) and
// the `history` genre token has no array row; both are pre-existing asymmetries
// the ADR records and the palette-sync guard checks only the seven named rows.

export interface GenreRow {
  /** Genre name, or null for the unnamed teal row. */
  genre: string | null;
  /** Avatar/cover background hue (bound to --u-raw-color-genre-<name>). */
  bg: string;
  /** Ink partner rendered on top of `bg`. */
  ink: string;
  /** Gradient end stop for the cover fallback. */
  coverTo: string;
}

export const GENRE_PALETTE = [
  { genre: "literary", bg: "#085041", ink: "#9FE1CB", coverTo: "#0A6B56" },
  { genre: "scifi", bg: "#133F7A", ink: "#B5D4F4", coverTo: "#1B5AAD" },
  { genre: "thriller", bg: "#7A2E14", ink: "#F5C4B3", coverTo: "#A5421E" },
  { genre: "fantasy", bg: "#4340A0", ink: "#CECBF6", coverTo: "#534AB7" },
  { genre: "mystery", bg: "#8B5A1B", ink: "#F5E3C7", coverTo: "#B07423" },
  { genre: "romance", bg: "#993556", ink: "#F4C0D1", coverTo: "#B34068" },
  { genre: "biography", bg: "#27500A", ink: "#D1ECB6", coverTo: "#3B6D11" },
  { genre: null, bg: "#0E3F4D", ink: "#B6DDE5", coverTo: "#185D70" },
] as const satisfies readonly GenreRow[];

// Story 75 / ADR 0073 — the genre BROWSE-CARD palette, keyed by genre slug.
// DECOUPLED from GENRE_PALETTE on purpose: `genreColor()` reads this first so the
// 16 genres get distinct, intentional backgrounds WITHOUT changing
// GENRE_PALETTE.length (which would re-color every book cover + avatar). Hex
// lives here (the sanctioned palette home).
//
export const GENRE_COLORS: Record<string, string> = {
  "literary-fiction": "#085041",
  "science-fiction": "#133F7A",
  mystery: "#8B5A1B",
  romance: "#993556",
  fantasy: "#4340A0",
  thriller: "#7A2E14",
  biography: "#27500A",
  history: "#5C4326",
  horror: "#4A1020",
  poetry: "#3A2E6B",
  "young-adult": "#186A6B",
  "graphic-novels": "#6B2D6B",
  philosophy: "#2B3A55",
  science: "#0E5A53",
  "self-help": "#7A5A12",
  memoir: "#5A2A4A",
};
