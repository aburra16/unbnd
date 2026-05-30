import {
  buildBookShelvesHeaderAddress,
  type DListAddress,
  type HexPubkey,
} from "@unbnd/schemas";
import {
  FIXTURE_LIBRARIAN_PUBKEY,
  FIXTURE_MIRA_PUBKEY,
} from "./fixture-constants";

const SHELVES_HEADER = buildBookShelvesHeaderAddress(FIXTURE_LIBRARIAN_PUBKEY);

type CoverFixture = {
  slug: string;
  title: string;
  coverFrom: string;
  coverTo: string;
  coverInk: string;
};

/**
 * Fixture/UI shape for the public-profile (`/profile/:handle`) Mira mock — not a
 * `@unbnd/schemas` wire type. Carries display-only fields (`count` for the
 * visible "N books" label, `covers` for the mini-thumbnail row) alongside
 * `bookSlugs` / `bookAddresses`, which are derived from `covers` so the
 * parallel-array invariant holds by construction.
 */
export type ProfileShelfFixture = {
  slug: string;
  name: string;
  visibility: "public" | "private";
  bookSlugs: readonly string[];
  bookAddresses: readonly DListAddress<39999>[];
  userPubkey: HexPubkey;
  parentHeader: DListAddress<39998>;
  // route augmentations
  count: number;
  covers: CoverFixture[];
};

function shelfFromCovers(input: {
  slug: string;
  name: string;
  count: number;
  visibility: "public" | "private";
  covers: CoverFixture[];
}): ProfileShelfFixture {
  return {
    slug: input.slug,
    name: input.name,
    visibility: input.visibility,
    bookSlugs: input.covers.map((c) => c.slug),
    bookAddresses: input.covers.map((c) => ({
      kind: 39999 as const,
      pubkey: FIXTURE_LIBRARIAN_PUBKEY,
      dTag: c.slug,
    })),
    userPubkey: FIXTURE_MIRA_PUBKEY,
    parentHeader: SHELVES_HEADER,
    count: input.count,
    covers: input.covers,
  };
}

export type ProfileActivityKind =
  | "rating"
  | "review"
  | "tag"
  | "ai-flag"
  | "shelf"
  | "follow";

export type ProfileActivity = {
  id: string;
  kind: ProfileActivityKind;
  text: React.ReactNode;
  timeLabel: string;
};

export type GenreAffinity = {
  slug: string;
  label: string;
  color: string;
  count: number;
};

export type ProfileRecord = {
  handle: string;
  displayName: string;
  initials: string;
  avatarBg: string;
  avatarInk: string;
  trustTier: string;
  trustPercentile: number;
  trustGrapeRank: number;
  bio: string;
  followers: number;
  following: number;
  stats: {
    booksRated: number;
    reviewsWritten: number;
    tagsApplied: number;
  };
  genreAffinity: GenreAffinity[];
  shelves: ProfileShelfFixture[];
  activity: ProfileActivity[];
  isAuthor?: boolean;
};

const mira: ProfileRecord = {
  handle: "mira-calloway",
  displayName: "Mira Calloway",
  initials: "MC",
  avatarBg: "#085041",
  avatarInk: "#9FE1CB",
  trustTier: "Top 2% curator",
  trustPercentile: 98,
  trustGrapeRank: 0.91,
  bio: "Reads literary fiction and the occasional short novel. Used to run a bookstore in Asheville. Currently working on a novel about the postal service.",
  followers: 1284,
  following: 142,
  stats: {
    booksRated: 412,
    reviewsWritten: 87,
    tagsApplied: 1056,
  },
  genreAffinity: [
    { slug: "literary-fiction", label: "Literary fiction", color: "#085041", count: 178 },
    { slug: "translated", label: "Translated", color: "#4340A0", count: 96 },
    { slug: "essays", label: "Essays", color: "#7A2E14", count: 64 },
    { slug: "short-novel", label: "Short novel", color: "#8B5A1B", count: 48 },
    { slug: "memoir", label: "Memoir", color: "#27500A", count: 26 },
  ],
  shelves: [
    shelfFromCovers({
      slug: "read",
      name: "Read",
      count: 412,
      visibility: "public",
      covers: [
        { slug: "orbital", title: "Orbital", coverFrom: "#7A2E14", coverTo: "#A5421E", coverInk: "#F5C4B3" },
        { slug: "james", title: "James", coverFrom: "#7A2845", coverTo: "#993556", coverInk: "#F4C0D1" },
        { slug: "intermezzo", title: "Intermezzo", coverFrom: "#353533", coverTo: "#52524E", coverInk: "#D3D1C7" },
        { slug: "all-fours", title: "All Fours", coverFrom: "#1D3F0A", coverTo: "#2D5E10", coverInk: "#C0DD97" },
        { slug: "trust", title: "Trust", coverFrom: "#0E3F4D", coverTo: "#185D70", coverInk: "#B6DDE5" },
        { slug: "demon-copperhead", title: "Demon Copperhead", coverFrom: "#3E389A", coverTo: "#534AB7", coverInk: "#EEEDFE" },
      ],
    }),
    shelfFromCovers({
      slug: "want-to-read",
      name: "Want to read",
      count: 38,
      visibility: "public",
      covers: [
        { slug: "north-woods", title: "North Woods", coverFrom: "#27500A", coverTo: "#3B6D11", coverInk: "#D1ECB6" },
        { slug: "creation-lake", title: "Creation Lake", coverFrom: "#6E4108", coverTo: "#8B5A1B", coverInk: "#FAEEDA" },
        { slug: "the-bee-sting", title: "The Bee Sting", coverFrom: "#8B5A1B", coverTo: "#B07423", coverInk: "#F5E3C7" },
        { slug: "tomorrow-and-tomorrow", title: "Tomorrow and Tomorrow", coverFrom: "#2E2872", coverTo: "#4340A0", coverInk: "#CECBF6" },
      ],
    }),
    shelfFromCovers({
      slug: "best-of-2026",
      name: "Best of 2026",
      count: 18,
      visibility: "public",
      covers: [
        { slug: "orbital", title: "Orbital", coverFrom: "#7A2E14", coverTo: "#A5421E", coverInk: "#F5C4B3" },
        { slug: "james", title: "James", coverFrom: "#7A2845", coverTo: "#993556", coverInk: "#F4C0D1" },
        { slug: "north-woods", title: "North Woods", coverFrom: "#27500A", coverTo: "#3B6D11", coverInk: "#D1ECB6" },
      ],
    }),
    shelfFromCovers({
      slug: "ai-slop",
      name: "AI slop · hall of shame",
      count: 7,
      visibility: "public",
      covers: [
        { slug: "ai-fragments", title: "The Algorithm Within", coverFrom: "#444248", coverTo: "#6A6770", coverInk: "#D2D0D6" },
      ],
    }),
  ],
  activity: [
    {
      id: "a1",
      kind: "review",
      text: "Wrote a review of Orbital by Samantha Harvey",
      timeLabel: "3 weeks ago",
    },
    {
      id: "a2",
      kind: "rating",
      text: "Rated James five stars",
      timeLabel: "1 month ago",
    },
    {
      id: "a3",
      kind: "tag",
      text: "Tagged The Bee Sting as Literary fiction",
      timeLabel: "1 month ago",
    },
    {
      id: "a4",
      kind: "ai-flag",
      text: "Flagged The Algorithm Within as AI generated",
      timeLabel: "5 weeks ago",
    },
    {
      id: "a5",
      kind: "shelf",
      text: "Added Trust to Best of 2026",
      timeLabel: "6 weeks ago",
    },
    {
      id: "a6",
      kind: "follow",
      text: "Followed Devi Ramanan",
      timeLabel: "2 months ago",
    },
  ],
};

export const profileRecords: Record<string, ProfileRecord> = {
  "mira-calloway": mira,
};

export function getProfileRecord(handle: string): ProfileRecord | undefined {
  return profileRecords[handle];
}
