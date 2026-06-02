// Story 35 / ADR 0036 §5 — the homepage trust shelves + the kept non-trust
// fallback (web). FAILING until `Home.tsx` fetches `api.homepage.shelves()` and
// renders the trust shelves (empty → absent) above the always-present non-trust
// fallback ("Recently added" recency shelf + "Explore genres" browse grid).
//
// Component test: the api CLIENT is stubbed (CLAUDE.md house rule — component
// tests never hit the network), NOT the module under test. The `HomepageShelves`
// type + `api.homepage.shelves()` client do not exist yet (intentionally red).
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { HomepageShelves, PublicBook, TaxonomyElement } from "../src/lib/api";

const recentMock = vi.fn();
const tagsListMock = vi.fn();
const homepageShelvesMock = vi.fn();

vi.mock("../src/lib/api", async (orig) => {
  const actual = await orig<typeof import("../src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      books: { ...actual.api.books, recent: (...a: unknown[]) => recentMock(...a) },
      tags: { ...actual.api.tags, list: (...a: unknown[]) => tagsListMock(...a) },
      // NEW (Story 35): the homepage trust-shelf serve client.
      homepage: { shelves: (...a: unknown[]) => homepageShelvesMock(...a) },
    },
  };
});

import { Home } from "../src/routes/Home";

function book(slug: string, title: string): PublicBook {
  return { slug, title, authorName: `Author of ${title}`, format: "reference" };
}

const GENRE_TAXONOMY: TaxonomyElement[] = [
  { slug: "sci-fi", name: "Science Fiction", type: "genre", sensitivity: "normal" },
  { slug: "mystery", name: "Mystery", type: "genre", sensitivity: "normal" },
];

function emptyShelves(): HomepageShelves {
  return { computedAt: null, trending: { books: [] }, favorites: { books: [] }, genres: [] };
}

function renderHome() {
  render(
    <MemoryRouter>
      <Home />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  recentMock.mockReset();
  tagsListMock.mockReset();
  homepageShelvesMock.mockReset();
  // Sensible defaults: a non-empty recency catalog + a genre taxonomy.
  recentMock.mockResolvedValue({ books: [book("recent-1", "Recent One")] });
  tagsListMock.mockResolvedValue({ tags: GENRE_TAXONOMY });
  homepageShelvesMock.mockResolvedValue(emptyShelves());
});

describe("Home — trust shelves render from api.homepage.shelves() (AC-1/2/3)", () => {
  it("renders Trending and Community Favorites when the cache has books", async () => {
    homepageShelvesMock.mockResolvedValue({
      computedAt: "2026-06-02T10:00:00Z",
      trending: { books: [book("orbital", "Orbital")] },
      favorites: { books: [book("piranesi", "Piranesi")] },
      genres: [{ slug: "sci-fi", name: "Science Fiction", books: [book("dune", "Dune")] }],
    } satisfies HomepageShelves);

    renderHome();

    expect(await screen.findByText(/trending/i)).toBeInTheDocument();
    expect(screen.getByText(/community favorites/i)).toBeInTheDocument();
    expect(screen.getByText("Orbital")).toBeInTheDocument();
    expect(screen.getByText("Piranesi")).toBeInTheDocument();
  });

  it("renders a genre shelf row from the cached genres", async () => {
    homepageShelvesMock.mockResolvedValue({
      computedAt: "2026-06-02T10:00:00Z",
      trending: { books: [] },
      favorites: { books: [] },
      genres: [{ slug: "sci-fi", name: "Science Fiction", books: [book("dune", "Dune")] }],
    } satisfies HomepageShelves);

    renderHome();

    expect(await screen.findByText("Dune")).toBeInTheDocument();
  });
});

describe("Home — empty trust shelves are honestly absent, never filler (AC-5)", () => {
  it("does not render a Trending shelf header when trending is empty", async () => {
    homepageShelvesMock.mockResolvedValue({
      computedAt: null,
      trending: { books: [] },
      favorites: { books: [book("piranesi", "Piranesi")] },
      genres: [],
    } satisfies HomepageShelves);

    renderHome();

    // Favorites appears (it has a book); Trending is absent (empty → no header).
    expect(await screen.findByText(/community favorites/i)).toBeInTheDocument();
    expect(screen.queryByText(/^trending$/i)).not.toBeInTheDocument();
  });

  it("renders NO trust shelves when every trust shelf is empty (no fabrication)", async () => {
    homepageShelvesMock.mockResolvedValue(emptyShelves());

    renderHome();

    // Wait for the page to settle on the fallback, then assert no trust headers.
    expect(await screen.findByText(/recently added/i)).toBeInTheDocument();
    expect(screen.queryByText(/^trending$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/community favorites/i)).not.toBeInTheDocument();
  });
});

describe("Home — the non-trust fallback is ALWAYS present and labeled as recency/browse (gate decision)", () => {
  it("always renders 'Recently added' (recency) and 'Explore genres' (browse)", async () => {
    homepageShelvesMock.mockResolvedValue(emptyShelves());

    renderHome();

    expect(await screen.findByText(/recently added/i)).toBeInTheDocument();
    expect(screen.getByText(/explore genres/i)).toBeInTheDocument();
  });

  it("keeps the non-trust fallback even when trust shelves are populated", async () => {
    homepageShelvesMock.mockResolvedValue({
      computedAt: "2026-06-02T10:00:00Z",
      trending: { books: [book("orbital", "Orbital")] },
      favorites: { books: [] },
      genres: [],
    } satisfies HomepageShelves);

    renderHome();

    expect(await screen.findByText(/trending/i)).toBeInTheDocument();
    // The recency/browse fallback sections are still present beneath the trust shelf.
    expect(screen.getByText(/recently added/i)).toBeInTheDocument();
    expect(screen.getByText(/explore genres/i)).toBeInTheDocument();
  });

  it("still renders the page when the shelves fetch fails (treated as no trust shelves)", async () => {
    homepageShelvesMock.mockRejectedValue(new Error("shelves serve 500"));

    renderHome();

    // The page degrades to the non-trust fallback — never a blank wall, never a throw.
    expect(await screen.findByText(/recently added/i)).toBeInTheDocument();
    expect(screen.queryByText(/^trending$/i)).not.toBeInTheDocument();
  });
});

describe("Home — no trust score/tier on any shelf card (AC-5 / CLAUDE.md)", () => {
  it("renders trust-shelf book cards with no GrapeRank number or tier string", async () => {
    homepageShelvesMock.mockResolvedValue({
      computedAt: "2026-06-02T10:00:00Z",
      trending: { books: [book("orbital", "Orbital")] },
      favorites: { books: [] },
      genres: [],
    } satisfies HomepageShelves);

    renderHome();

    const trendingHeading = await screen.findByText(/trending/i);
    // The shelf section around the heading carries no tier/percentile/GrapeRank text.
    const section = trendingHeading.closest("section") ?? document.body;
    expect(within(section).queryByText(/top \d+%/i)).not.toBeInTheDocument();
    expect(within(section).queryByText(/graperank/i)).not.toBeInTheDocument();
    expect(within(section).queryByText(/trusted/i)).not.toBeInTheDocument();
  });
});
