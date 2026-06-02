// Story 36 / ADR 0037 §5 (web) — the For-You shelf on the homepage. FAILING
// until `Home.tsx` fetches `api.foryou()` and renders, ABOVE the Story-35 house
// trust shelves:
//   - personalized + books → a "For you" Shelf at the top.
//   - not_personalized     → an honest invitation (ADR §5 draft copy) + a link
//                            to the personalize flow, in the shelf's place.
//   - anonymous            → nothing (silent absence for signed-out).
//   - personalized + []    → nothing (honest empty; the shelf is absent).
//
// Component test: the api CLIENT is stubbed (CLAUDE.md — component tests never
// hit the network), NOT the module under test. The `ForYou` type +
// `api.foryou()` client do not exist yet (intentionally red). The For-You
// fixtures are typed to the REAL `ForYou` contract from the api module.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type {
  ForYou,
  HomepageShelves,
  PublicBook,
  TaxonomyElement,
} from "../src/lib/api";

const recentMock = vi.fn();
const tagsListMock = vi.fn();
const homepageShelvesMock = vi.fn();
const foryouMock = vi.fn();

vi.mock("../src/lib/api", async (orig) => {
  const actual = await orig<typeof import("../src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      books: { ...actual.api.books, recent: (...a: unknown[]) => recentMock(...a) },
      tags: { ...actual.api.tags, list: (...a: unknown[]) => tagsListMock(...a) },
      homepage: { shelves: (...a: unknown[]) => homepageShelvesMock(...a) },
      // NEW (Story 36): the read-time For-You client.
      foryou: (...a: unknown[]) => foryouMock(...a),
    },
  };
});

import { Home } from "../src/routes/Home";

function book(slug: string, title: string): PublicBook {
  return { slug, title, authorName: `Author of ${title}`, format: "reference" };
}

const GENRE_TAXONOMY: TaxonomyElement[] = [
  { slug: "sci-fi", name: "Science Fiction", type: "genre", sensitivity: "normal" },
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
  foryouMock.mockReset();
  recentMock.mockResolvedValue({ books: [book("recent-1", "Recent One")] });
  tagsListMock.mockResolvedValue({ tags: GENRE_TAXONOMY });
  homepageShelvesMock.mockResolvedValue(emptyShelves());
  // Default: signed-out (no For-You). Individual tests override.
  foryouMock.mockResolvedValue({ state: "anonymous", books: [] } satisfies ForYou);
});

describe("Home — For-You shelf for a personalized user (AC-1)", () => {
  it("renders a 'For you' shelf with the user's books when state is personalized + non-empty", async () => {
    foryouMock.mockResolvedValue({
      state: "personalized",
      books: [book("orbital", "Orbital"), book("piranesi", "Piranesi")],
    } satisfies ForYou);

    renderHome();

    expect(await screen.findByText(/for you/i)).toBeInTheDocument();
    expect(screen.getByText("Orbital")).toBeInTheDocument();
    expect(screen.getByText("Piranesi")).toBeInTheDocument();
  });

  it("places the For-You shelf ABOVE the house trust shelves (Trending)", async () => {
    foryouMock.mockResolvedValue({
      state: "personalized",
      books: [book("orbital", "Orbital")],
    } satisfies ForYou);
    homepageShelvesMock.mockResolvedValue({
      computedAt: "2026-06-02T10:00:00Z",
      trending: { books: [book("dune", "Dune")] },
      favorites: { books: [] },
      genres: [],
    } satisfies HomepageShelves);

    renderHome();

    const foryou = await screen.findByText(/for you/i);
    const trending = await screen.findByText(/trending/i);
    // For-You appears before Trending in document order (it is the top surface).
    expect(foryou.compareDocumentPosition(trending) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("Home — non-personalized invitation (AC-5)", () => {
  it("renders the honest invitation (and a link to personalize) when state is not_personalized", async () => {
    foryouMock.mockResolvedValue({ state: "not_personalized", books: [] } satisfies ForYou);

    renderHome();

    // The ADR §5 draft invitation copy (no-slop reviewed): the curators-rate-highly line.
    expect(
      await screen.findByText(/build your web of trust and this shelf fills/i),
    ).toBeInTheDocument();
    // An affordance to personalize is offered (link/button label).
    expect(screen.getByText(/personalize your view/i)).toBeInTheDocument();
    // It is NOT a populated "For you" of arbitrary books — no book cards in the invitation.
    expect(screen.queryByText("Orbital")).not.toBeInTheDocument();
  });
});

describe("Home — silent absence for signed-out + personalized-but-empty (AC-5 / AC-7)", () => {
  it("renders NOTHING for an anonymous (signed-out) user — no shelf, no invitation", async () => {
    foryouMock.mockResolvedValue({ state: "anonymous", books: [] } satisfies ForYou);

    renderHome();

    // Wait for the page to settle on the fallback, then assert no For-You surface.
    expect(await screen.findByText(/recently added/i)).toBeInTheDocument();
    expect(screen.queryByText(/^for you$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/build your web of trust and this shelf fills/i)).not.toBeInTheDocument();
  });

  it("renders NOTHING when personalized but the shelf is honestly empty (no fabrication)", async () => {
    foryouMock.mockResolvedValue({ state: "personalized", books: [] } satisfies ForYou);

    renderHome();

    expect(await screen.findByText(/recently added/i)).toBeInTheDocument();
    expect(screen.queryByText(/^for you$/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/build your web of trust and this shelf fills/i)).not.toBeInTheDocument();
  });

  it("still renders the rest of the page when the For-You fetch fails (degrade to nothing)", async () => {
    foryouMock.mockRejectedValue(new Error("foryou 500"));

    renderHome();

    // The homepage degrades: house shelves + non-trust fallback still render.
    expect(await screen.findByText(/recently added/i)).toBeInTheDocument();
    expect(screen.queryByText(/^for you$/i)).not.toBeInTheDocument();
  });
});

describe("Home — no trust score/tier on any For-You card (CLAUDE.md)", () => {
  it("renders For-You cards with no GrapeRank number / tier / 'trusted' text", async () => {
    foryouMock.mockResolvedValue({
      state: "personalized",
      books: [book("orbital", "Orbital")],
    } satisfies ForYou);

    renderHome();

    const heading = await screen.findByText(/for you/i);
    const section = heading.closest("section") ?? document.body;
    expect(within(section).queryByText(/top \d+%/i)).not.toBeInTheDocument();
    expect(within(section).queryByText(/graperank/i)).not.toBeInTheDocument();
    expect(within(section).queryByText(/trusted/i)).not.toBeInTheDocument();
  });
});
