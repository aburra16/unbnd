// Failing tests (red) for Story 31 / ADR 0032 §4 — the new AuthorBadge. Given
// `claimants: { npub }[]` it:
//   - 0 claimants → renders nothing (no badge),
//   - 1 → "Claimed by {name}" linking to /profile/{npub},
//   - N → "Claimed by {name} and {N} others" (honest multi-claimant, no winner),
//   - resolves npub→name via the Story 29 path (useProfileMeta + displayNameOf)
//     with an honest shortNpub fallback when there's no kind-0,
//   - says "claimed", NEVER "verified" — the "claimed ≠ verified" honesty (AC-7).
//
// Boundary mocks only (useProfileMeta). Role-scoped queries. No Date.now.
// Red until apps/web/src/components/AuthorBadge.tsx exists.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AuthorBadge } from "../../src/components/AuthorBadge";
import { shortNpub } from "../../src/lib/view-model";

// useProfileMeta(npub) → kind-0 metadata; displayNameOf is the real fallback
// chain (displayName ?? name ?? fallback). We vary the meta per npub.
const metaByNpub = new Map<string, { name?: string; displayName?: string } | null>();
const profileMetaMock = vi.fn((npub: string) => metaByNpub.get(npub) ?? null);
vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: (npub: string) => profileMetaMock(npub),
  displayNameOf: (meta: { displayName?: string; name?: string } | null, fallback: string) =>
    meta?.displayName ?? meta?.name ?? fallback,
}));

const NPUB_A = "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23";
const NPUB_B = "npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqsxq3xnz";
const NPUB_C = "npub1zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzs9x8w3l";

beforeEach(() => {
  metaByNpub.clear();
  profileMetaMock.mockClear();
});
afterEach(() => vi.clearAllMocks());

function renderBadge(claimants: { npub: string }[]) {
  return render(
    <MemoryRouter>
      <AuthorBadge claimants={claimants} />
    </MemoryRouter>,
  );
}

describe("AuthorBadge — no claim (AC-2)", () => {
  it("renders nothing when there are zero claimants", () => {
    const { container } = renderBadge([]);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("AuthorBadge — single claimant (AC-2)", () => {
  it('shows "Claimed by {name}" and links to the claimant profile', () => {
    metaByNpub.set(NPUB_A, { displayName: "Samantha Harvey" });
    renderBadge([{ npub: NPUB_A }]);
    const link = screen.getByRole("link", { name: /Samantha Harvey/ });
    expect(link).toHaveAttribute("href", `/profile/${NPUB_A}`);
    expect(screen.getByText(/Claimed by/i)).toBeInTheDocument();
  });

  it("falls back to a short npub when the claimant has no kind-0 name", () => {
    metaByNpub.set(NPUB_A, null);
    renderBadge([{ npub: NPUB_A }]);
    expect(screen.getByText(new RegExp(shortNpub(NPUB_A)))).toBeInTheDocument();
  });
});

describe("AuthorBadge — multiple claimants, shown honestly (AC-2)", () => {
  it('shows "Claimed by {name} and N others" with no silently chosen winner', () => {
    metaByNpub.set(NPUB_A, { displayName: "First Claimant" });
    metaByNpub.set(NPUB_B, { displayName: "Second" });
    metaByNpub.set(NPUB_C, { displayName: "Third" });
    renderBadge([{ npub: NPUB_A }, { npub: NPUB_B }, { npub: NPUB_C }]);
    // The lead claimant name and an honest "and N others" count for the rest.
    expect(screen.getByText(/First Claimant/)).toBeInTheDocument();
    expect(screen.getByText(/and 2 others/i)).toBeInTheDocument();
  });
});

describe("AuthorBadge — claimed ≠ verified (AC-7)", () => {
  it('never renders the word "verified" (the badge states a self-claim only)', () => {
    metaByNpub.set(NPUB_A, { displayName: "Samantha Harvey" });
    renderBadge([{ npub: NPUB_A }]);
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it("uses the word 'claimed' to do the honesty work", () => {
    metaByNpub.set(NPUB_A, { displayName: "Samantha Harvey" });
    renderBadge([{ npub: NPUB_A }]);
    expect(screen.getByText(/claimed/i)).toBeInTheDocument();
  });
});
