// Failing tests (red) for Story 19 AC-1 / AC-2 / AC-5–AC-8 (web side) — the
// polished /profile/me. Mirrors profile-me-shelves.test.tsx. Targets the
// ProfileMe rewrite ADR 0019 specifies: shelves render via BookGrid/BookCard
// with title+author and NO raw ol-... slug as a label; stats come from
// api.profile.meStats() and a stat that is ABSENT from the response is hidden
// (never a fabricated 0), while a present 0 shows.
//
// MIGRATED for Story 29 / ADR 0030: this file mocks a SOVEREIGN user. The bare
// full npub that ProfileMe used to print under the name is gone; the sovereign
// header now shows a MIDDLE-TRUNCATED shortNpub chip + a <CopyButton>. The Story
// 19 protected behaviors below (enriched shelves, honest stats) are unchanged;
// the header-npub expectation is added in the "nostr identity header" block.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ProfileMe } from "../../src/routes/ProfileMe";

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => null,
  displayNameOf: (_meta: unknown, fallback: string) => fallback,
}));

const submissionsMineMock = vi.fn();
const shelvesMineMock = vi.fn();
const meStatsMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: { mine: (...a: unknown[]) => submissionsMineMock(...a) },
    shelves: { mine: (...a: unknown[]) => shelvesMineMock(...a) },
    profile: { meStats: (...a: unknown[]) => meStatsMock(...a) },
  },
}));

const sovereignUser = {
  id: "u1",
  email: null,
  displayName: "Reader",
  npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23",
};
const FULL_NPUB = sovereignUser.npub;
// shortNpub(FULL_NPUB) — slice(0,10)+"…"+slice(-4).
const SHORT_NPUB = "npub1n0ewa…rk23";

// Enriched shelf shape (PublicBook elements) per ADR 0019 Decision 1.
const enrichedShelves = {
  shelves: [
    {
      slug: "want-to-read",
      name: "Want to Read",
      count: 2,
      books: [
        { slug: "ol-ol21177w", title: "Orbital", authorName: "Samantha Harvey", format: "reference", coverUrl: "https://covers/orbital.jpg" },
        { slug: "north-woods", title: "North Woods", authorName: "Daniel Mason", format: "reference" },
      ],
    },
  ],
};

beforeEach(() => {
  submissionsMineMock.mockReset().mockResolvedValue({ submissions: [] });
  shelvesMineMock.mockReset().mockResolvedValue({ shelves: [] });
  meStatsMock.mockReset().mockResolvedValue({ stats: {} });
  sessionMock.mockReset().mockReturnValue({
    status: "signed-in",
    user: sovereignUser,
    refresh: vi.fn(),
  });
});
afterEach(() => vi.clearAllMocks());

function renderMe() {
  return render(
    <MemoryRouter>
      <ProfileMe />
    </MemoryRouter>,
  );
}

describe("ProfileMe — enriched shelf books (AC-1)", () => {
  it("renders shelf books with title and author, not the raw slug", async () => {
    shelvesMineMock.mockResolvedValue(enrichedShelves);
    renderMe();
    expect(await screen.findByText("Orbital")).toBeInTheDocument();
    expect(screen.getByText("Samantha Harvey")).toBeInTheDocument();
    // North Woods has no coverUrl, so BookCard (per ADR 0019) renders its title
    // both as the gradient-fallback cover art and as the meta label. Scope the
    // assertion to the meta label so we verify the real title shows there.
    expect(
      screen.getByText("North Woods", { selector: ".book-title" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Daniel Mason")).toBeInTheDocument();
    // The raw catalog slug is never shown as the book's visible label.
    expect(screen.queryByText("ol-ol21177w")).not.toBeInTheDocument();
  });

  it("links each shelf book to its book detail page (BookCard)", async () => {
    shelvesMineMock.mockResolvedValue(enrichedShelves);
    renderMe();
    const orbital = await screen.findByText("Orbital");
    const link = orbital.closest("a");
    expect(link).toHaveAttribute("href", "/book/ol-ol21177w");
  });
});

describe("ProfileMe — honest stats (AC-5, AC-6, AC-7, AC-8)", () => {
  it("shows the real numbers from api.profile.meStats", async () => {
    meStatsMock.mockResolvedValue({ stats: { booksRated: 12, reviews: 5, tagsApplied: 31 } });
    renderMe();
    await waitFor(() => expect(meStatsMock).toHaveBeenCalled());
    expect(await screen.findByText("12")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("31")).toBeInTheDocument();
  });

  it("renders a genuine zero as 0 when the stat is present (AC-8)", async () => {
    meStatsMock.mockResolvedValue({ stats: { booksRated: 0, reviews: 0, tagsApplied: 0 } });
    renderMe();
    await waitFor(() => expect(meStatsMock).toHaveBeenCalled());
    // "Books rated" with a present 0 shows the label and a 0.
    expect(await screen.findByText("Books rated")).toBeInTheDocument();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
  });

  it("HIDES a stat that is absent from the response — never a fabricated 0 (AC-8)", async () => {
    // tagsApplied absent (its read failed server-side); booksRated/reviews present.
    meStatsMock.mockResolvedValue({ stats: { booksRated: 7, reviews: 2 } });
    renderMe();
    await waitFor(() => expect(meStatsMock).toHaveBeenCalled());
    expect(await screen.findByText("Books rated")).toBeInTheDocument();
    // The hidden stat's label must not render at all.
    expect(screen.queryByText("Tags applied")).not.toBeInTheDocument();
  });

  it("does not show any of the three stats when the whole stats call fails", async () => {
    meStatsMock.mockRejectedValue(new Error("boom"));
    shelvesMineMock.mockResolvedValue(enrichedShelves);
    renderMe();
    // The shelves still render (independent read) but no fabricated count cells.
    expect(await screen.findByText("Orbital")).toBeInTheDocument();
    expect(screen.queryByText("Books rated")).not.toBeInTheDocument();
    expect(screen.queryByText("Tags applied")).not.toBeInTheDocument();
  });
});

// MIGRATED (Story 29 / ADR 0030): the sovereign header no longer prints the bare
// full npub. It now shows the middle-truncated shortNpub chip + a CopyButton.
describe("ProfileMe — sovereign nostr-identity header (Story 29 AC-1/AC-5)", () => {
  it("no longer prints the bare full npub under the name", async () => {
    renderMe();
    await screen.findByRole("heading", { name: "Reader" });
    expect(screen.queryByText(FULL_NPUB)).not.toBeInTheDocument();
  });

  it("shows the truncated npub chip and a copy control instead", async () => {
    renderMe();
    expect(await screen.findByText(SHORT_NPUB)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /copy your npub/i }),
    ).toBeInTheDocument();
  });
});
