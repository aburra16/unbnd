// Failing tests (red) for Story 24 AC-9 (and AC-2/AC-5 on the byline) — the
// `ReviewsList` review byline resolves the rater's kind-0 DISPLAY NAME and is a
// link to their profile (ADR 0024 implementation note 4).
//
// Contract pinned here:
//   - A reviewer WITH a kind-0 display name → the byline shows that resolved
//     name (NOT the short-npub), resolved via useProfileMeta (the same cached
//     path the RatedByRow badges use), and the byline is a <Link> to
//     `/profile/<that npub>` (AC-9 / AC-2).
//   - A reviewer WITHOUT a kind-0 name → the byline falls back to `shortNpub`,
//     still a <Link> to `/profile/<npub>` (AC-9 fallback).
//   - npub-only: the href is the raw npub the response carries; no 64-char hex
//     appears in any href or visible text (AC-5).
//
// Today `review-name` is plain text showing `shortNpub` (no Link, no name
// resolution), so every assertion here is red until note 4 lands.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReviewsList } from "../../src/components/ReviewsList";
import type { PublicRating } from "../../src/lib/api";

// Resolve the byline name via the cached hook (mocked — no relay round-trip).
// displayNameOf is the real fallback chain (kind-0 displayName → name → fallback).
const profileMetaMock = vi.fn();
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (...a: unknown[]) => profileMetaMock(...a),
  displayNameOf: (meta: { displayName?: string; name?: string } | null, fallback: string) =>
    meta?.displayName ?? meta?.name ?? fallback,
}));

const HEX64 = "a".repeat(64);
const NAMED_NPUB = "npub1named0000000000000000000000000000000000000000000000000000";
const ANON_NPUB = "npub1anon00000000000000000000000000000000000000000000000000000";

function review(npub: string, text: string): PublicRating {
  return { npub, score: 5, reviewText: text, reviewDate: "2026-02-02" };
}

function renderList(ratings: PublicRating[]) {
  return render(
    <MemoryRouter>
      <ReviewsList ratings={ratings} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  profileMetaMock.mockReset().mockReturnValue(null);
});
afterEach(() => vi.clearAllMocks());

describe("ReviewsList byline — resolves the kind-0 display name and links (AC-9)", () => {
  it("shows the resolved display name (not the short-npub) for a reviewer with a kind-0 name", () => {
    profileMetaMock.mockImplementation((id: string) =>
      id === NAMED_NPUB ? { npub: NAMED_NPUB, displayName: "Ada Lovelace" } : null,
    );
    renderList([review(NAMED_NPUB, "A careful, generous read.")]);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    // The short-npub treatment must NOT be the byline when a name resolves.
    expect(screen.queryByText(/npub1named0…/)).not.toBeInTheDocument();
  });

  it("links the named byline to /profile/<that npub>", () => {
    profileMetaMock.mockReturnValue({ npub: NAMED_NPUB, displayName: "Ada Lovelace" });
    renderList([review(NAMED_NPUB, "A careful, generous read.")]);
    const link = screen.getByRole("link", { name: /ada lovelace/i });
    expect(link).toHaveAttribute("href", `/profile/${NAMED_NPUB}`);
  });

  it("falls back to shortNpub when the reviewer has no kind-0 name, still linked", () => {
    profileMetaMock.mockReturnValue(null); // no resolvable kind-0
    renderList([review(ANON_NPUB, "No note name, just a review.")]);
    // shortNpub form: npub1anon0…0000 (first 10 … last 4).
    const link = screen.getByRole("link", { name: /npub1anon0…/i });
    expect(link).toHaveAttribute("href", `/profile/${ANON_NPUB}`);
  });

  it("resolves the byline name via the cached useProfileMeta path (one resolution per reviewer)", () => {
    profileMetaMock.mockReturnValue({ npub: NAMED_NPUB, displayName: "Ada Lovelace" });
    renderList([review(NAMED_NPUB, "Resolved through the cached hook.")]);
    expect(profileMetaMock).toHaveBeenCalledWith(NAMED_NPUB);
  });

  it("renders no hex pubkey in any byline href or visible text (AC-5)", () => {
    profileMetaMock.mockReturnValue({ npub: NAMED_NPUB, displayName: "Ada Lovelace" });
    const { container } = renderList([review(NAMED_NPUB, "npub only, never hex.")]);
    for (const a of screen.getAllByRole("link")) {
      expect(a.getAttribute("href") ?? "").not.toContain(HEX64);
    }
    expect(container.innerHTML).not.toContain(HEX64);
  });
});
