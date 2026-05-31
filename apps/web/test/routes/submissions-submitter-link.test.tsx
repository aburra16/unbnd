// Failing tests (red) for Story 24 AC-4 (and AC-5) — the submitter identity on
// the community submissions page becomes a link (ADR 0024 implementation note 5).
//
// Contract pinned here:
//   - A submission WITH a `submitter` npub → "added by <submitter>" is a <Link>
//     to `/profile/<submitter npub>` (AC-4).
//   - A submission with NO `submitter` → no "added by" text and no broken link;
//     no crash (AC-4, current behavior preserved).
//   - npub-only: the href is the raw npub; no 64-char hex in href or text (AC-5).
//
// Today the submitter renders as plain `added by ${shortNpub(...)}` text (no
// Link), so the link assertions are red until note 5 lands.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CommunitySubmissions } from "../../src/routes/CommunitySubmissions";
import type { SubmittedBook } from "../../src/lib/api";

const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: { list: (...a: unknown[]) => listMock(...a) },
    // Nav -> useSession reads auth.me; reject so it settles to signed-out.
    auth: { me: vi.fn().mockRejectedValue(new Error("signed out")) },
    profile: { get: vi.fn(async () => ({ profile: {} })) },
  },
}));

const HEX64 = "a".repeat(64);
const SUBMITTER_NPUB =
  "npub1submtr0000000000000000000000000000000000000000000000000000";

function submission(over: Partial<SubmittedBook> = {}): SubmittedBook {
  return {
    slug: "ol-some-book",
    title: "A Submitted Book",
    authorName: "Some Author",
    createdAt: 1_700_000_000,
    ...over,
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CommunitySubmissions />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  listMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("CommunitySubmissions submitter — present submitter links (AC-4)", () => {
  it("renders 'added by <submitter>' as a link to /profile/<submitter npub>", async () => {
    listMock.mockResolvedValue({
      submissions: [submission({ submitter: SUBMITTER_NPUB })],
    });
    renderPage();
    await screen.findByText("A Submitted Book");
    const link = screen.getByRole("link", { name: /npub1submtr0…|added by/i });
    expect(link).toHaveAttribute("href", `/profile/${SUBMITTER_NPUB}`);
  });

  it("renders no hex pubkey in the submitter link href or text (AC-5)", async () => {
    listMock.mockResolvedValue({
      submissions: [submission({ submitter: SUBMITTER_NPUB })],
    });
    const { container } = renderPage();
    await screen.findByText("A Submitted Book");
    const link = screen.getByRole("link", { name: /npub1submtr0…|added by/i });
    expect(link.getAttribute("href") ?? "").not.toContain(HEX64);
    expect(container.innerHTML).not.toContain(HEX64);
  });
});

describe("CommunitySubmissions submitter — absent submitter (AC-4)", () => {
  it("renders no 'added by' text and no broken link when submitter is absent", async () => {
    listMock.mockResolvedValue({ submissions: [submission({ submitter: undefined })] });
    renderPage();
    await screen.findByText("A Submitted Book");
    expect(screen.queryByText(/added by/i)).not.toBeInTheDocument();
    // No profile link rendered for this item.
    expect(
      screen.queryByRole("link", { name: /\/profile\// }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /added by/i }),
    ).not.toBeInTheDocument();
  });

  it("does not crash and still lists the book when submitter is absent", async () => {
    listMock.mockResolvedValue({ submissions: [submission({ submitter: undefined })] });
    renderPage();
    await waitFor(() =>
      expect(screen.getByText("A Submitted Book")).toBeInTheDocument(),
    );
  });
});
