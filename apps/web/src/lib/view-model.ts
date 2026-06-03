// Maps live API shapes (PublicBook, tags consensus, ratings) into what the
// render components need (ADR 0010). No fabricated data: covers fall back to a
// deterministic gradient when Open Library has none; reviewers are shown by
// short npub (no trust tier until GrapeRank).
import { GENRE_PALETTE } from "@unbnd/ui";
import type { Book } from "../components/BookCard";
import type { PublicBook } from "./api";

// Brand-adjacent gradient palette for the cover fallback. Picked
// deterministically from the slug so a book always gets the same cover.
// Derived from the single palette source (ADR 0040 §3) — order preserved, so
// the hash → cover mapping is byte-identical to the former inline rows.
const COVERS: ReadonlyArray<{ from: string; to: string; ink: string }> =
  GENRE_PALETTE.map((r) => ({ from: r.bg, to: r.coverTo, ink: r.ink }));

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
