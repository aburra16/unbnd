// Failing tests (red) for Story 24 AC-1, AC-2, AC-3, AC-5, AC-6, AC-8 — the new
// `RatedByRow` component (ADR 0024, Option A / implementation note 1 & 2).
//
// Contract pinned here:
//   - Takes the ACTIVE perspective's `ratings: PublicRating[]` (each carries
//     npub + score + optional reviewText).
//   - Renders ≤5 circular Avatar badges (ALL raters, reviewers included), each a
//     React Router <Link> to `/profile/<that npub>` (AC-1/AC-2).
//   - Renders a "+N" expander chip (a <button>, NOT a Link) when there are more
//     than 5 raters; clicking it expands IN PLACE to a wrapping grid of a badge
//     for EVERY rater, each still a link (AC-1/AC-2).
//   - The overflow badges mount ONLY after expand — the lazy guarantee: before
//     expand, badges 6..N (and the kind-0 fetch their hook would fire) are absent
//     from the DOM (ADR 0024 note 1 "do not mount all N up front").
//   - Zero raters → renders nothing (AC-8 — no empty shell, no placeholder).
//   - A rate-only rater (no reviewText) still appears as a badge, and in the
//     EXPANDED grid shows name + `★ score` (AC-3).
//   - Carries a "Rated by" label.
//   - npub for display, hex never required: no 64-char hex appears in any href or
//     visible text (AC-5).
//
// `RatedByRow` does not exist yet → the import fails → this whole file is red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RatedByRow } from "../../src/components/RatedByRow";
import type { PublicRating } from "../../src/lib/api";

// Mirror the proven AccountMenu/Profile composition: mock useProfileMeta so no
// network/relay is hit, and provide the real displayNameOf fallback chain.
const profileMetaMock = vi.fn();
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (...a: unknown[]) => profileMetaMock(...a),
  displayNameOf: (meta: { displayName?: string; name?: string } | null, fallback: string) =>
    meta?.displayName ?? meta?.name ?? fallback,
}));

// A 64-char hex pubkey — must never leak into an href or visible text (AC-5).
const HEX64 = "a".repeat(64);

// Distinct, valid-looking npub strings (the exact strings the API returns).
function npub(n: number): string {
  // 63 chars after the "npub1" prefix, ending in a per-rater digit so each is
  // distinct yet long enough that shortNpub elides the middle.
  return `npub1rater${String(n).padStart(2, "0")}${"q".repeat(49)}`;
}

function rating(n: number, over: Partial<PublicRating> = {}): PublicRating {
  return { npub: npub(n), score: 4, reviewDate: "2026-01-01", ...over };
}

function renderRow(ratings: PublicRating[]) {
  return render(
    <MemoryRouter>
      <RatedByRow ratings={ratings} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  // Default: no kind-0 resolves → every badge falls back to shortNpub.
  profileMetaMock.mockReset().mockReturnValue(null);
});
afterEach(() => vi.clearAllMocks());

describe("RatedByRow — badges per rater up to the cap (AC-1)", () => {
  it("renders a badge per rater (no overflow) when there are 5 or fewer raters", () => {
    renderRow([rating(1), rating(2), rating(3)]);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(3);
    // No "+N" chip when nothing overflows.
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the 'Rated by' label", () => {
    renderRow([rating(1), rating(2)]);
    expect(screen.getByText(/rated by/i)).toBeInTheDocument();
  });

  it("shows only the first 5 badges plus a '+N' chip when there are more than 5 raters", () => {
    renderRow(Array.from({ length: 8 }, (_, i) => rating(i + 1)));
    // Collapsed: at most 5 profile links visible.
    expect(screen.getAllByRole("link")).toHaveLength(5);
    // The remainder is surfaced as a "+3" expander chip (a button, not a link).
    expect(screen.getByRole("button", { name: /\+?\s*3|all 8 raters/i })).toBeInTheDocument();
  });
});

describe("RatedByRow — every badge links to /profile/<npub> (AC-2 / AC-5)", () => {
  it("links each visible badge to that rater's npub-addressed profile", () => {
    const ratings = [rating(1), rating(2), rating(3)];
    renderRow(ratings);
    for (const r of ratings) {
      const link = screen
        .getAllByRole("link")
        .find((a) => a.getAttribute("href") === `/profile/${r.npub}`);
      expect(link, `a link to /profile/${r.npub}`).toBeTruthy();
    }
  });

  it("never renders a hex pubkey in any href or visible text (npub-only, AC-5)", () => {
    // Even if a kind-0 resolves, the route + display stay npub-addressed.
    profileMetaMock.mockReturnValue({ npub: npub(1), displayName: "Curator One" });
    const { container } = renderRow([rating(1), rating(2)]);
    for (const a of screen.getAllByRole("link")) {
      expect(a.getAttribute("href") ?? "").not.toContain(HEX64);
    }
    expect(container.innerHTML).not.toContain(HEX64);
  });
});

describe("RatedByRow — '+N' expands in place to all raters (AC-1 / AC-2)", () => {
  it("reveals a linked badge for EVERY rater after the chip is clicked", () => {
    const ratings = Array.from({ length: 8 }, (_, i) => rating(i + 1));
    renderRow(ratings);
    fireEvent.click(screen.getByRole("button"));
    // All 8 raters are now present and each is a profile link.
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    for (const r of ratings) {
      expect(hrefs).toContain(`/profile/${r.npub}`);
    }
    expect(screen.getAllByRole("link")).toHaveLength(8);
  });
});

describe("RatedByRow — lazy-on-expand: overflow badges mount only after expand (ADR 0024 note 1)", () => {
  it("does not render the 6th+ rater (nor fire its kind-0 fetch) before expand", () => {
    const ratings = Array.from({ length: 8 }, (_, i) => rating(i + 1));
    renderRow(ratings);
    // Badge for the 6th rater is absent from the DOM while collapsed. Asserted by
    // exact href (collision-free): shortNpub elides the per-rater digit, so every
    // collapsed badge shares the same accessible name — only the full npub-addressed
    // href distinguishes one rater from another, so a by-href check is the only
    // sound way to prove badge-6 specifically is unmounted.
    const collapsedHrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(collapsedHrefs).not.toContain(`/profile/${npub(6)}`);
    // The lazy guarantee is structural: useProfileMeta only fires for mounted
    // badges, so the overflow raters' ids are not resolved while collapsed.
    const resolved = profileMetaMock.mock.calls.map((c) => c[0]);
    expect(resolved).not.toContain(npub(6));
    expect(resolved).not.toContain(npub(8));

    // After expand they mount (and resolve).
    fireEvent.click(screen.getByRole("button"));
    const afterHrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(afterHrefs).toContain(`/profile/${npub(6)}`);
  });
});

describe("RatedByRow — zero raters renders nothing (AC-8)", () => {
  it("renders nothing for an empty ratings array (no shell, no placeholder)", () => {
    const { container } = renderRow([]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("RatedByRow — a rate-only rater is surfaced and shows name + score (AC-1 / AC-3)", () => {
  it("renders a badge for a rater with no reviewText", () => {
    renderRow([rating(1, { reviewText: undefined, score: 5 })]);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", `/profile/${npub(1)}`);
  });

  it("shows the rater's score in the expanded grid (★ score), name resolved from kind-0", () => {
    profileMetaMock.mockReturnValue({ npub: npub(1), displayName: "Star Curator" });
    // >5 raters so the row collapses; expand to reach the name+score grid.
    const ratings = [
      rating(1, { reviewText: undefined, score: 5 }),
      ...Array.from({ length: 6 }, (_, i) => rating(i + 2)),
    ];
    renderRow(ratings);
    fireEvent.click(screen.getByRole("button"));
    const badge = screen
      .getAllByRole("link")
      .find((a) => a.getAttribute("href") === `/profile/${npub(1)}`)!;
    const row = badge.closest("li, div") ?? badge;
    // The expanded grid shows name + the star score for the rate-only rater.
    expect(within(row as HTMLElement).getByText(/star curator/i)).toBeInTheDocument();
    expect(within(row as HTMLElement).getByText(/★/)).toBeInTheDocument();
  });
});

describe("RatedByRow — links whatever npubs the passed-in array carries (AC-6)", () => {
  it("renders exactly the perspective array's raters, in order, each linked", () => {
    // Simulates a trust-weighted perspective that returns a specific subset.
    const ratings = [rating(3), rating(7), rating(1)];
    renderRow(ratings);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual([
      `/profile/${npub(3)}`,
      `/profile/${npub(7)}`,
      `/profile/${npub(1)}`,
    ]);
  });
});
