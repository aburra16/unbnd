import {
  buildBookRecordsHeaderAddress,
  type BookRecord as SchemaBookRecord,
} from "@unbnd/schemas";
import type { Book } from "../components/BookCard";
import { FIXTURE_LIBRARIAN_PUBKEY } from "./fixture-constants";

export type GenreTag = {
  slug: string;
  label: string;
  color: string;
  confidence: number;
};

export type QualitySignal = {
  slug: string;
  label: string;
  tone: "positive" | "negative" | "sovereign" | "amber";
  count: number;
};

export type Review = {
  id: string;
  reviewer: {
    name: string;
    initials: string;
    avatarBg: string;
    avatarInk: string;
    trustTier: string;
  };
  rating: number;
  text: string;
  helpfulCount: number;
  postedLabel: string;
};

export type WhereToRead = {
  label: string;
  source: string;
  href: string;
};

export type AuthorInfo = {
  name: string;
  initials: string;
  verified: boolean;
  bio: string;
  moreBy?: { slug: string; title: string; coverFrom: string; coverTo: string; coverInk: string }[];
};

export type RatingDistribution = {
  stars: 5 | 4 | 3 | 2 | 1;
  count: number;
};

/**
 * The rendering-augmented book record. Composes the wire-shape
 * `@unbnd/schemas` BookRecord with the extra fields the BookDetail
 * route renders (cover gradient, rating aggregates, reviews, etc.).
 *
 * Every entry satisfies `@unbnd/schemas` BookRecord — that conformance
 * is asserted in `apps/web/test/fixtures.test.ts`.
 */
export type BookDetailRecord = SchemaBookRecord &
  Pick<Book, "coverFrom" | "coverTo" | "coverInk" | "rating"> & {
    /** Display alias for the schema's `authorName`. Kept for the existing UI surface. */
    author: string;
    primaryGenreSlug: string;
    primaryGenreLabel: string;
    genreTags: GenreTag[];
    qualitySignals: QualitySignal[];
    aggregateRating: number;
    ratingCount: number;
    distribution: RatingDistribution[];
    reviews: Review[];
    whereToRead: WhereToRead[];
    authorInfo: AuthorInfo;
  };

const BOOKS_HEADER = buildBookRecordsHeaderAddress(FIXTURE_LIBRARIAN_PUBKEY);

const orbital: BookDetailRecord = {
  // Wire-shape fields
  slug: "orbital",
  title: "Orbital",
  authorName: "Samantha Harvey",
  isbn13: "9780802161543",
  pageCount: 207,
  publishYear: 2023,
  language: "en",
  blurb:
    "Six astronauts circle the Earth from a space station, sixteen orbits in a single day. A typhoon gathers force over the Pacific. A father dies on a continent below. Across the slow hours of a working shift, the crew watch the planet roll past the window and weigh what it means to leave home, to keep watch, to return.",
  format: "reference",
  source: "openlibrary",
  parentHeader: BOOKS_HEADER,
  // Rendering augmentations
  author: "Samantha Harvey",
  rating: 4.8,
  coverFrom: "#7A2E14",
  coverTo: "#A5421E",
  coverInk: "#F5C4B3",
  primaryGenreSlug: "literary-fiction",
  primaryGenreLabel: "Literary fiction",
  genreTags: [
    { slug: "literary-fiction", label: "Literary fiction", color: "#085041", confidence: 0.94 },
    { slug: "science-fiction", label: "Science fiction", color: "#133F7A", confidence: 0.62 },
    { slug: "short-novel", label: "Short novel", color: "#8B5A1B", confidence: 0.78 },
  ],
  qualitySignals: [
    { slug: "well-edited", label: "Well edited", tone: "positive", count: 41 },
    { slug: "original-voice", label: "Original voice", tone: "positive", count: 28 },
  ],
  aggregateRating: 4.8,
  ratingCount: 312,
  distribution: [
    { stars: 5, count: 220 },
    { stars: 4, count: 70 },
    { stars: 3, count: 16 },
    { stars: 2, count: 4 },
    { stars: 1, count: 2 },
  ],
  reviews: [
    {
      id: "r1",
      reviewer: {
        name: "Mira Calloway",
        initials: "MC",
        avatarBg: "#085041",
        avatarInk: "#9FE1CB",
        trustTier: "Top 2% curator",
      },
      rating: 5,
      text: "The book reads the way a long shift on a watch tower reads. You stop counting the hours. The prose holds steady and the planet keeps turning under it. Harvey makes the smallest tasks feel like the heart of the work.",
      helpfulCount: 84,
      postedLabel: "3 weeks ago",
    },
    {
      id: "r2",
      reviewer: {
        name: "Devi Ramanan",
        initials: "DR",
        avatarBg: "#4340A0",
        avatarInk: "#CECBF6",
        trustTier: "Top 5% curator",
      },
      rating: 5,
      text: "Short, attentive, exactly the length it needs to be. The chapters track the orbits, and each one settles a little more of the weight that began on the first page. I went back to it the next morning to read the closing pages again.",
      helpfulCount: 52,
      postedLabel: "1 month ago",
    },
    {
      id: "r3",
      reviewer: {
        name: "Hal Knox",
        initials: "HK",
        avatarBg: "#7A2E14",
        avatarInk: "#F5C4B3",
        trustTier: "Top 8% curator",
      },
      rating: 4,
      text: "Quiet, accomplished, occasionally too quiet. The set pieces over the typhoon land. The grief thread did not always land for me, though I respect the restraint behind the choice.",
      helpfulCount: 19,
      postedLabel: "2 months ago",
    },
  ],
  whereToRead: [
    { label: "Bookshop.org", source: "Independent retail", href: "https://bookshop.org" },
    { label: "Open Library", source: "Library reference", href: "https://openlibrary.org" },
    { label: "Author website", source: "Author link", href: "#" },
  ],
  authorInfo: {
    name: "Samantha Harvey",
    initials: "SH",
    verified: false,
    bio: "Samantha Harvey is the author of five novels, including The Western Wind and The Shapeless Unease. Orbital won the Booker Prize in 2024.",
    moreBy: [
      { slug: "the-western-wind", title: "The Western Wind", coverFrom: "#1D3F0A", coverTo: "#2D5E10", coverInk: "#C0DD97" },
      { slug: "dear-thief", title: "Dear Thief", coverFrom: "#353533", coverTo: "#52524E", coverInk: "#D3D1C7" },
      { slug: "the-shapeless-unease", title: "The Shapeless Unease", coverFrom: "#6E4108", coverTo: "#8B5A1B", coverInk: "#FAEEDA" },
    ],
  },
};

export const bookRecords: Record<string, BookDetailRecord> = {
  orbital,
};

export function getBookRecord(slug: string): BookDetailRecord | undefined {
  return bookRecords[slug];
}
