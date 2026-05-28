import {
  buildBookGenresHeaderAddress,
  type DListAddress,
} from "@unbnd/schemas";
import type { Book } from "../components/BookCard";
import { FIXTURE_LIBRARIAN_PUBKEY } from "./fixture-constants";

export type CuratorDot = {
  initials: string;
  bg: string;
  ink: string;
  trustTier: string;
};

/**
 * UI augmentation of the wire-shape `@unbnd/schemas` BookGenre. Adds
 * route-only fields (color, bookCount, subgenres, top curators, books)
 * that don't belong on the DList event. Every entry's `parentHeader`
 * resolves to the librarian's "genres" concept header — fixture-only
 * librarian pubkey, real deployments resolve at runtime.
 */
export type GenreRecord = {
  slug: string;
  name: string;
  description: string;
  parentHeader: DListAddress<39998>;
  // route augmentations
  color: string;
  countColor: string;
  bookCount: number;
  subgenres: { slug: string; label: string }[];
  topCurators: CuratorDot[];
  books: Book[];
};

const GENRES_HEADER = buildBookGenresHeaderAddress(FIXTURE_LIBRARIAN_PUBKEY);

const literary: GenreRecord = {
  slug: "literary-fiction",
  name: "Literary fiction",
  parentHeader: GENRES_HEADER,
  color: "#085041",
  countColor: "#0A6B56",
  bookCount: 2340,
  description:
    "Character-driven fiction with attention to prose, structure, and psychological depth. Books in this category reward careful reading and reward it again on a second pass.",
  subgenres: [
    { slug: "all", label: "All" },
    { slug: "autofiction", label: "Autofiction" },
    { slug: "campus", label: "Campus" },
    { slug: "domestic", label: "Domestic" },
    { slug: "historical", label: "Historical" },
    { slug: "translated", label: "Translated" },
    { slug: "experimental", label: "Experimental" },
  ],
  topCurators: [
    { initials: "MC", bg: "#085041", ink: "#9FE1CB", trustTier: "Top 2% curator" },
    { initials: "DR", bg: "#4340A0", ink: "#CECBF6", trustTier: "Top 5% curator" },
    { initials: "HK", bg: "#7A2E14", ink: "#F5C4B3", trustTier: "Top 8% curator" },
    { initials: "JR", bg: "#993556", ink: "#F4C0D1", trustTier: "Top 9% curator" },
  ],
  books: [
    {
      slug: "orbital",
      title: "Orbital",
      author: "Samantha Harvey",
      rating: 4.8,
      coverFrom: "#7A2E14",
      coverTo: "#A5421E",
      coverInk: "#F5C4B3",
      signals: [
        { label: "Well edited", tone: "positive" },
        { label: "Original voice", tone: "positive" },
      ],
    },
    {
      slug: "james",
      title: "James",
      author: "Percival Everett",
      rating: 4.9,
      coverFrom: "#7A2845",
      coverTo: "#993556",
      coverInk: "#F4C0D1",
      signals: [{ label: "Original voice", tone: "positive" }],
    },
    {
      slug: "intermezzo",
      title: "Intermezzo",
      author: "Sally Rooney",
      rating: 4.1,
      coverFrom: "#353533",
      coverTo: "#52524E",
      coverInk: "#D3D1C7",
    },
    {
      slug: "all-fours",
      title: "All Fours",
      author: "Miranda July",
      rating: 4.4,
      coverFrom: "#1D3F0A",
      coverTo: "#2D5E10",
      coverInk: "#C0DD97",
      signals: [{ label: "Original voice", tone: "positive" }],
    },
    {
      slug: "creation-lake",
      title: "Creation Lake",
      author: "Rachel Kushner",
      rating: 4.2,
      coverFrom: "#6E4108",
      coverTo: "#8B5A1B",
      coverInk: "#FAEEDA",
    },
    {
      slug: "demon-copperhead",
      title: "Demon Copperhead",
      author: "Barbara Kingsolver",
      rating: 4.8,
      coverFrom: "#3E389A",
      coverTo: "#534AB7",
      coverInk: "#EEEDFE",
      signals: [{ label: "Well edited", tone: "positive" }],
    },
    {
      slug: "north-woods",
      title: "North Woods",
      author: "Daniel Mason",
      rating: 4.6,
      coverFrom: "#27500A",
      coverTo: "#3B6D11",
      coverInk: "#D1ECB6",
    },
    {
      slug: "the-bee-sting",
      title: "The Bee Sting",
      author: "Paul Murray",
      rating: 4.5,
      coverFrom: "#8B5A1B",
      coverTo: "#B07423",
      coverInk: "#F5E3C7",
    },
    {
      slug: "trust",
      title: "Trust",
      author: "Hernan Diaz",
      rating: 4.3,
      coverFrom: "#0E3F4D",
      coverTo: "#185D70",
      coverInk: "#B6DDE5",
    },
    {
      slug: "ai-fragments",
      title: "The Algorithm Within",
      author: "S. Vega",
      rating: 2.7,
      coverFrom: "#444248",
      coverTo: "#6A6770",
      coverInk: "#D2D0D6",
      signals: [{ label: "AI generated", tone: "negative" }],
    },
  ],
};

export const genreRecords: Record<string, GenreRecord> = {
  "literary-fiction": literary,
};

export function getGenreRecord(slug: string): GenreRecord | undefined {
  return genreRecords[slug];
}
