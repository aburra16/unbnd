// Maps live API shapes (PublicBook, tags consensus, ratings) into what the
// render components need (ADR 0010). No fabricated data: covers fall back to a
// deterministic gradient when Open Library has none; reviewers are shown by
// short npub (no trust tier until GrapeRank).
import type { Book } from "../components/BookCard";
import type { PublicBook } from "./api";

// Brand-adjacent gradient palette for the cover fallback. Picked
// deterministically from the slug so a book always gets the same cover.
const COVERS: ReadonlyArray<{ from: string; to: string; ink: string }> = [
  { from: "#085041", to: "#0A6B56", ink: "#9FE1CB" },
  { from: "#133F7A", to: "#1B5AAD", ink: "#B5D4F4" },
  { from: "#7A2E14", to: "#A5421E", ink: "#F5C4B3" },
  { from: "#4340A0", to: "#534AB7", ink: "#CECBF6" },
  { from: "#8B5A1B", to: "#B07423", ink: "#F5E3C7" },
  { from: "#993556", to: "#B34068", ink: "#F4C0D1" },
  { from: "#27500A", to: "#3B6D11", ink: "#D1ECB6" },
  { from: "#0E3F4D", to: "#185D70", ink: "#B6DDE5" },
];

function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export function coverGradient(seed: string): {
  from: string;
  to: string;
  ink: string;
} {
  return COVERS[hash(seed) % COVERS.length]!;
}

/** Map a catalog book to the BookCard shape (cover image when present). */
export function toCardBook(book: PublicBook): Book {
  const g = coverGradient(book.slug);
  return {
    slug: book.slug,
    title: book.title,
    author: book.authorName,
    coverUrl: book.coverUrl,
    coverFrom: g.from,
    coverTo: g.to,
    coverInk: g.ink,
  };
}

/** A stable accent colour for a genre chip/card, picked from the palette. */
export function genreColor(seed: string): string {
  return COVERS[hash(seed) % COVERS.length]!.from;
}

/** npub1abcd…wxyz — enough to recognise, short enough to fit a byline. */
export function shortNpub(npub: string): string {
  if (npub.length <= 16) return npub;
  return `${npub.slice(0, 10)}…${npub.slice(-4)}`;
}
