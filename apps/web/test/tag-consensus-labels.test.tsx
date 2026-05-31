// FAILING TESTS — Story 25 / ADR 0025, web side (AC-3, AC-4).
// The book-detail classification block must render a section-level
// "trusted consensus" / "community consensus" label from `weighted`, and a
// subtle token-only marker on community-only chips (trusted:false) inside an
// otherwise-trusted section. Intentionally red until BookHeader/TagControl read
// the new `trusted`/`weighted` fields.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { BookHeader } from "../src/components/BookHeader";
import { TagControl } from "../src/components/TagControl";
import type { BookTags, PublicBook, TagConsensus } from "../src/lib/api";

// TagControl reads the session + taxonomy via the api client; stub both so the
// component renders the read view deterministically.
vi.mock("../src/hooks/useSession", () => ({
  useSession: () => ({ status: "signed-out" as const, refresh: () => {} }),
}));
vi.mock("../src/lib/api", async (orig) => {
  const actual = await orig<typeof import("../src/lib/api")>();
  return {
    ...actual,
    api: {
      ...actual.api,
      tags: { ...actual.api.tags, list: vi.fn().mockResolvedValue({ tags: [] }) },
    },
  };
});

const BOOK: PublicBook = {
  slug: "orbital",
  title: "Orbital",
  authorName: "Samantha Harvey",
  format: "reference",
};

function tag(slug: string, type: TagConsensus["type"], trusted: boolean): TagConsensus {
  return { slug, name: slug, type, applies: 2, disputes: 0, trusted };
}

describe("Classification block — AC-3 trusted consensus label", () => {
  it("labels the section 'trusted consensus' when weighted is true", () => {
    const tags: BookTags = {
      genres: [tag("literary-fiction", "genre", true)],
      styles: [],
      signals: [],
      weighted: true,
    };
    render(
      <MemoryRouter>
        <TagControl bookSlug="orbital" tags={tags} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/trusted consensus/i)).toBeInTheDocument();
    expect(screen.queryByText(/community consensus/i)).not.toBeInTheDocument();
  });
});

describe("Classification block — AC-4 community consensus label + empty state", () => {
  it("labels the section 'community consensus' when weighted is false but tags exist", () => {
    const tags: BookTags = {
      genres: [tag("literary-fiction", "genre", false)],
      styles: [],
      signals: [],
      weighted: false,
    };
    render(
      <MemoryRouter>
        <TagControl bookSlug="orbital" tags={tags} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/community consensus/i)).toBeInTheDocument();
    expect(screen.queryByText(/trusted consensus/i)).not.toBeInTheDocument();
  });

  it("keeps the existing honest empty state when there are no tags", () => {
    const tags: BookTags = { genres: [], styles: [], signals: [], weighted: false };
    render(
      <MemoryRouter>
        <TagControl bookSlug="orbital" tags={tags} />
      </MemoryRouter>,
    );
    expect(screen.getByText(/No genres or styles applied yet\./i)).toBeInTheDocument();
    // No consensus label on a tagless book.
    expect(screen.queryByText(/consensus/i)).not.toBeInTheDocument();
  });
});

describe("Chip marker — AC-4 community-only chip inside a trusted section", () => {
  it("marks a trusted:false chip distinctly inside an otherwise-trusted section", () => {
    const tags: BookTags = {
      genres: [tag("literary-fiction", "genre", true), tag("space-opera", "genre", false)],
      styles: [],
      signals: [],
      // Section is trusted overall (≥1 trusted tag) but one chip is community-only.
      weighted: true,
    };
    const { container } = render(
      <MemoryRouter>
        <BookHeader book={BOOK} genres={tags.genres} styles={tags.styles} weighted={tags.weighted} />
      </MemoryRouter>,
    );
    // The community-only chip carries a token-only marker class; the trusted
    // chip does not. The Implementer picks the exact class name — the contract
    // is that the two chips render differently by their `trusted` state.
    const communityChips = container.querySelectorAll(".pill-community");
    expect(communityChips.length).toBe(1);
  });
});
