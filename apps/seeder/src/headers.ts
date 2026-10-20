// Build a kind-39998 concept-header event template (word-wrapper
// `conceptHeader`), since @unbnd/schemas only has header *address* builders.
// ADR 0008 / BIBLE.md word-wrapper convention.
import type { NostrEventTemplate } from "@unbnd/schemas";

export type ConceptHeaderInput = {
  readonly slug: string;
  readonly name: string;
  readonly title: string;
  readonly createdAt: number;
};

/**
 * A signable kind-39998 template: d-tag = slug, a `["json", …]` tag carrying
 * `{ word: { slug, name, title, wordTypes: ["word","conceptHeader"] },
 * conceptHeader: { slug, name, title } }`, empty content.
 */
export function buildConceptHeaderTemplate(
  input: ConceptHeaderInput,
): NostrEventTemplate {
  const { slug, name, title, createdAt } = input;
  const payload = {
    word: { slug, name, title, wordTypes: ["word", "conceptHeader"] },
    conceptHeader: { slug, name, title },
  };
  return {
    kind: 39998,
    created_at: createdAt,
    content: "",
    tags: [
      ["d", slug],
      ["json", JSON.stringify(payload)],
    ],
  };
}

// The declared books header (Story 97 / ADR 0087). The seeder republishes its
// headers on every run, so this is the only place the list's definition can
// live: a header fixed anywhere else would be reverted by the next seed.

/** A URL template pinned by event id (Brainstorm-UI dlist-presentation-conventions §5). */
export type LinkTemplate = {
  readonly id: string;
  readonly relay: string;
  readonly placeholder: string;
  readonly field: string;
};

/**
 * Button order on the book page: the canonical page first (Open Library),
 * then reviews (Goodreads). Kind-9999 items on `39998:2efaa715…:url-templates`,
 * signed by the operator's key (b83a28b7…); pinned by id so no one can edit
 * them under this list.
 */
export const BOOKS_LINK_TEMPLATES: readonly LinkTemplate[] = [
  {
    // Open Library work: https://openlibrary.org/works/{id}
    id: "e722c94c9ee31ed28b79687b17daa313c0d02a9936a1c07dc73fbab4288fbc10",
    relay: "wss://dcosl.brainstorm.world",
    placeholder: "id",
    field: "open-library-id",
  },
  {
    // Goodreads book (ISBN-10): https://www.goodreads.com/book/isbn/{isbn10}
    id: "a3037637a77a5b0338639f570b6cf24aa292a1bea322e18d2f4e69144df0cb57",
    relay: "wss://dcosl.brainstorm.world",
    placeholder: "isbn10",
    field: "isbn10",
  },
];

/** The Unbnd mark, pinned to the commit that added it. */
const BOOKS_LIST_IMAGE =
  "https://raw.githubusercontent.com/aburra16/unbnd/0b4535752a90883cc81881cace2cda9abb440e81/assets/logos/android-chrome-512x512.png";

/** Field names are the tags the seed already writes; renaming one breaks every reader. */
const BOOKS_FIELDS: ReadonlyArray<readonly [string, string, string]> = [
  ["required", "title", "Title"],
  ["recommended", "author", "Author, as Open Library writes it"],
  ["recommended", "cover", "Cover image"],
  ["recommended", "isbn", "ISBN-13"],
  ["optional", "isbn10", "ISBN-10"],
  ["optional", "open-library-id", "Open Library work id, e.g. OL19722168W"],
  ["optional", "year", "Year first published"],
  ["optional", "pages", "Page count"],
  ["optional", "lang", "Language, as an ISO 639-2 code"],
  ["optional", "subject", "A subject; repeats"],
  ["optional", "format", "Record format"],
  ["optional", "source", "Where this record came from"],
];

const HEX64 = /^[0-9a-f]{64}$/;

export function buildBooksHeaderTemplate(input: {
  readonly librarian: string;
  readonly createdAt: number;
  readonly links: readonly LinkTemplate[];
}): NostrEventTemplate {
  const { librarian, createdAt, links } = input;
  const declared = new Set(BOOKS_FIELDS.map(([, name]) => name));
  for (const l of links) {
    if (!HEX64.test(l.id)) throw new Error(`books header: link template id is not 64 hex: ${l.id}`);
    if (!declared.has(l.field)) throw new Error(`books header: link field is not declared: ${l.field}`);
  }
  const legacy = buildConceptHeaderTemplate({ slug: "books", name: "books", title: "Books", createdAt });
  return {
    kind: 39998,
    created_at: createdAt,
    content: "",
    tags: [
      ["d", "books"],
      ["names", "Book", "Books"],
      [
        "description",
        "Books by title and author, from Open Library, kept by the Unbnd librarian. Readers rate, shelve and tag them on Unbnd.",
      ],
      ...BOOKS_FIELDS.map(([level, name, desc]) => [level, name, desc]),
      ["field-type", "cover", "url"],
      ["display", "title", "title"],
      ["display", "summary", "author"],
      ["display", "image", "cover"],
      ["display", "fact", "year", "Published"],
      ["display", "fact", "pages", "Pages"],
      ["image", BOOKS_LIST_IMAGE],
      ["r", "https://github.com/aburra16/unbnd"],
      ["r", "https://openlibrary.org/developers/licensing"],
      ...links.map((l) => ["link", l.id, l.relay, l.placeholder, l.field]),
      ["b", `39998:${librarian}:books`, "pointer"],
      legacy.tags.find((t) => t[0] === "json")!,
    ],
  };
}

/** Every header the seeder owns, in publish order. Both entrypoints publish exactly this. */
export function seededHeaderTemplates(librarian: string, createdAt: number): NostrEventTemplate[] {
  return [
    buildBooksHeaderTemplate({ librarian, createdAt, links: BOOKS_LINK_TEMPLATES }),
    buildConceptHeaderTemplate({ slug: "book-tags", name: "book-tags", title: "Book tags", createdAt }),
    buildConceptHeaderTemplate({
      slug: "book-tag-assertions",
      name: "book-tag-assertions",
      title: "Book tag assertions",
      createdAt,
    }),
    buildConceptHeaderTemplate({
      slug: "book-submissions",
      name: "book-submissions",
      title: "Book submissions",
      createdAt,
    }),
  ];
}
