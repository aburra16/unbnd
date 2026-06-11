// FAILING TESTS — Story 81 / ADR 0079 (web: the contested chip treatment).
//
// A `contested: true` tag renders muted + struck with a small "contested"
// label (the wireframe treatment), the applies count suppressed, taking
// precedence over the `community` sub-treatment — on BOTH chip surfaces
// (BookHeader and TagControl). A normally-applied tag renders exactly as
// today.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GenrePill } from "@unbnd/ui";
import { BookHeader } from "../../src/components/BookHeader";
import { TagControl } from "../../src/components/TagControl";
import type { BookTags, PublicBook, TagConsensus } from "../../src/lib/api";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    tags: {
      list: vi.fn(async () => ({ tags: [] })),
      template: vi.fn(),
      submit: vi.fn(),
      submitCustodial: vi.fn(),
      reveal: vi.fn(),
    },
  },
}));

beforeEach(() => {
  sessionMock.mockReset().mockReturnValue({ status: "signed-out", refresh: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

const contestedTag: TagConsensus = {
  slug: "space-opera",
  name: "Space opera",
  type: "genre",
  applies: 1,
  disputes: 2,
  trusted: true,
  contested: true,
};

const settledTag: TagConsensus = {
  slug: "literary-fiction",
  name: "Literary fiction",
  type: "genre",
  applies: 3,
  disputes: 0,
  trusted: true,
};

const book: PublicBook = {
  slug: "orbital",
  title: "Orbital",
  authorName: "Samantha Harvey",
  format: "reference",
};

describe("GenrePill — the contested treatment (ADR 0079 §2)", () => {
  it("a contested pill carries the contested class, the label, and suppresses the count", () => {
    const { container } = render(<GenrePill label="Space opera" count={3} contested />);
    const pill = container.querySelector(".pill-genre");
    expect(pill?.className).toContain("pill-contested");
    expect(screen.getByText("contested")).toBeInTheDocument();
    // The applies count is suppressed on a struck chip.
    expect(container.querySelector(".pill-conf")).not.toBeInTheDocument();
  });

  it("contested takes precedence over community; a plain pill is unchanged", () => {
    const both = render(<GenrePill label="X" community contested />);
    const pill = both.container.querySelector(".pill-genre");
    expect(pill?.className).toContain("pill-contested");
    expect(pill?.className).not.toContain("pill-community");
    both.unmount();

    const plain = render(<GenrePill label="Y" count={2} />);
    const p = plain.container.querySelector(".pill-genre");
    expect(p?.className).not.toContain("pill-contested");
    expect(plain.container.querySelector(".pill-conf")).toHaveTextContent("2");
  });
});

describe("BookHeader — contested chips pass through", () => {
  it("renders the contested genre struck + labelled; the settled genre normally", () => {
    const { container } = render(
      <MemoryRouter>
        <BookHeader
          book={book}
          genres={[contestedTag, settledTag]}
          styles={[]}
          weighted={true}
          claimants={[]}
        />
      </MemoryRouter>,
    );
    const contested = container.querySelector(".pill-contested");
    expect(contested).toHaveTextContent("Space opera");
    expect(screen.getByText("contested")).toBeInTheDocument();
    // The settled chip is not struck.
    expect(screen.getByText("Literary fiction").closest(".pill")?.className).not.toContain(
      "pill-contested",
    );
  });
});

describe("TagControl — contested chips pass through", () => {
  it("renders the contested genre struck + labelled in the classification section", () => {
    const tags: BookTags = {
      genres: [contestedTag, settledTag],
      styles: [],
      signals: [],
      weighted: true,
    };
    const { container } = render(
      <MemoryRouter>
        <TagControl bookSlug="orbital" tags={tags} />
      </MemoryRouter>,
    );
    const contested = container.querySelector(".pill-contested");
    expect(contested).toHaveTextContent("Space opera");
    expect(screen.getByText("contested")).toBeInTheDocument();
  });
});
