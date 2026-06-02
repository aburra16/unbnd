// Failing tests (red) for Story 32 / ADR 0033 §3 — the AuthorBadge VERIFIED
// state. The book read now annotates each claimant with `verified: boolean`. A
// verified claimant renders a "Verified Author" mark (visually + textually
// distinct from "Claimed by"); an unverified claimant stays "Claimed by {name}"
// (never "verified"). A mixed set renders each in its honest state. No trust-tier
// string, no raw GrapeRank number, no raw curator count appears (AC-4 / CLAUDE.md).
//
// Boundary mocks only (useProfileMeta). Role-scoped queries. No Date.now.
// Red until AuthorBadge accepts `verified` on claimants and renders the upgrade.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthorBadge } from "../../src/components/AuthorBadge";

const metaByNpub = new Map<string, { name?: string; displayName?: string } | null>();
const profileMetaMock = vi.fn((npub: string) => metaByNpub.get(npub) ?? null);
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (npub: string) => profileMetaMock(npub),
  displayNameOf: (meta: { displayName?: string; name?: string } | null, fallback: string) =>
    meta?.displayName ?? meta?.name ?? fallback,
}));

const NPUB_A = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const NPUB_B = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsxq3xnz";

beforeEach(() => {
  metaByNpub.clear();
  profileMetaMock.mockClear();
});
afterEach(() => vi.clearAllMocks());

// `verified` is the additive per-claimant flag (typed optional so a missing flag
// behaves as the unverified "claimed" state).
function renderBadge(claimants: { npub: string; verified?: boolean }[]) {
  return render(
    <MemoryRouter>
      <AuthorBadge claimants={claimants} />
    </MemoryRouter>,
  );
}

describe("AuthorBadge — verified upgrade (AC-4)", () => {
  it('renders "Verified Author" for a verified claimant', () => {
    metaByNpub.set(NPUB_A, { displayName: "Samantha Harvey" });
    renderBadge([{ npub: NPUB_A, verified: true }]);
    expect(screen.getByText(/verified author/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Samantha Harvey/ })).toHaveAttribute(
      "href",
      `/profile/${NPUB_A}`,
    );
  });

  it('stays "Claimed by {name}" for an UNVERIFIED claimant (never "verified")', () => {
    metaByNpub.set(NPUB_A, { displayName: "Samantha Harvey" });
    renderBadge([{ npub: NPUB_A, verified: false }]);
    expect(screen.getByText(/claimed by/i)).toBeInTheDocument();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it("the two states are honestly distinct: verified shows 'Verified Author', not 'Claimed by'", () => {
    metaByNpub.set(NPUB_A, { displayName: "Samantha Harvey" });
    renderBadge([{ npub: NPUB_A, verified: true }]);
    expect(screen.queryByText(/claimed by/i)).not.toBeInTheDocument();
  });
});

describe("AuthorBadge — mixed verified/unverified set, each honest (AC-4)", () => {
  it("renders the verified claimant as Verified Author and the bare one as Claimed", () => {
    metaByNpub.set(NPUB_A, { displayName: "Verified Author Name" });
    metaByNpub.set(NPUB_B, { displayName: "Bare Claimant Name" });
    renderBadge([
      { npub: NPUB_A, verified: true },
      { npub: NPUB_B, verified: false },
    ]);
    expect(screen.getByText(/verified author/i)).toBeInTheDocument();
    expect(screen.getByText(/claimed by/i)).toBeInTheDocument();
  });
});

describe("AuthorBadge — no trust tier / number leaks (AC-4 / CLAUDE.md)", () => {
  it("shows no raw GrapeRank number or curator count beyond the badge state", () => {
    metaByNpub.set(NPUB_A, { displayName: "Samantha Harvey" });
    const { container } = renderBadge([{ npub: NPUB_A, verified: true }]);
    const text = container.textContent ?? "";
    // No bare digits (a count or a 0.0–1.0 weight) anywhere in the badge.
    expect(text).not.toMatch(/\d/);
    // No trust-tier vocabulary.
    expect(text.toLowerCase()).not.toMatch(/graperank|weight|curator|score/);
  });
});
