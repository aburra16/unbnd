// FAILING TESTS (red) — Story 33 / ADR 0034 §2, §5. The TagControl picker offers
// accusatory signal tags ONLY when `canAssertAccusatory` is true (AC-1), and a
// revealed accusatory tag renders attributed to a review action — distinct from
// genre/style chips, NOT "community consensus", NO curator count/tally (AC-5).
//
// Mocks are typed against the REAL lib/api.ts shapes (BookTags / TaxonomyElement)
// so the red set typechecks clean (the PR-#74 rule). Module-level mocks of the
// sibling api client + session hook only (no intra-module vi.mock), mirroring
// the existing tag-control.test.tsx.
//
// RED until TagControl reads `canAssertAccusatory` (offering accusatory tags
// when true), and renders a revealed accusatory tag with the honest "reviewed"
// treatment carrying the `revealed` marker off the BookTags read shape.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TagControl } from "../../src/components/TagControl";
import type { BookTags, TagConsensus, TaxonomyElement } from "../../src/lib/api";
import type { UseSession } from "../../src/hooks/useSession";

// Story 33 adds `canAssertAccusatory?: boolean` to BookTags and `revealed?:
// boolean` to TagConsensus on the real lib/api.ts read shape (ADR 0034 §2/§5).
// These local widenings type the test fixtures against the SHAPE the Implementer
// adds, so the RED set fails the rendered-behavior ASSERTIONS, not tsc (the
// PR-#74 rule). The Implementer's field additions make these widenings no-ops.
type BookTagsR = BookTags & { canAssertAccusatory?: boolean };
type RevealedSignal = TagConsensus & { revealed?: boolean };

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const listMock = vi.fn<() => Promise<{ tags: TaxonomyElement[] }>>();
const templateMock = vi.fn();
const submitMock = vi.fn();
const submitCustodialMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    tags: {
      list: (...a: unknown[]) => listMock(...(a as [])),
      template: (...a: unknown[]) => templateMock(...a),
      submit: (...a: unknown[]) => submitMock(...a),
      submitCustodial: (...a: unknown[]) => submitCustodialMock(...a),
    },
  },
}));

const sovereignUser = {
  id: "u1",
  email: null,
  displayName: "npub1n0ewa…rk23",
  npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23",
};

// A taxonomy carrying a normal genre, a normal style, and an accusatory signal.
const TAXONOMY: TaxonomyElement[] = [
  { slug: "mystery", type: "genre", name: "Mystery", sensitivity: "normal" },
  { slug: "short-novel", type: "style", name: "Short novel", sensitivity: "normal" },
  { slug: "ai-generated", type: "signal", name: "AI generated", sensitivity: "accusatory" },
];

const EMPTY: BookTags = { genres: [], styles: [], signals: [] };

beforeEach(() => {
  listMock.mockReset().mockResolvedValue({ tags: TAXONOMY });
  templateMock.mockReset();
  submitMock.mockReset();
  submitCustodialMock.mockReset();
  sessionMock.mockReset();
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
});

function renderControl(tags: BookTagsR) {
  return render(
    <MemoryRouter>
      <TagControl bookSlug="orbital" tags={tags} />
    </MemoryRouter>,
  );
}

describe("TagControl — accusatory picker offer (AC-1)", () => {
  it("offers the accusatory signal tags when canAssertAccusatory is true", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    const tags: BookTagsR = { ...EMPTY, canAssertAccusatory: true };
    renderControl(tags);
    await screen.findByRole("combobox");
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(await screen.findByRole("option", { name: /AI generated/i })).toBeInTheDocument();
    // The genre is still offered alongside.
    expect(screen.getByRole("option", { name: "Mystery" })).toBeInTheDocument();
  });

  it("does NOT offer accusatory tags when canAssertAccusatory is false", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    const tags: BookTagsR = { ...EMPTY, canAssertAccusatory: false };
    renderControl(tags);
    await screen.findByRole("combobox");
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.queryByRole("option", { name: /AI generated/i })).not.toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Mystery" })).toBeInTheDocument();
  });

  it("does NOT offer accusatory tags when the flag is absent (default-closed)", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: sovereignUser, refresh: vi.fn() });
    renderControl(EMPTY);
    await screen.findByRole("combobox");
    await waitFor(() => expect(listMock).toHaveBeenCalled());
    expect(screen.queryByRole("option", { name: /AI generated/i })).not.toBeInTheDocument();
  });

  it("does NOT offer accusatory tags to a signed-out user even if the flag leaks true", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    const tags: BookTagsR = { ...EMPTY, canAssertAccusatory: true };
    renderControl(tags);
    // Signed-out has no picker at all — only the create-account prompt.
    expect(
      await screen.findByText(/create a free account to suggest a genre or style\./i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });
});

describe("TagControl — revealed accusatory tag renders honestly (AC-5)", () => {
  it("renders a revealed accusatory tag attributed to a review action, not as community consensus", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    const revealedSignal: RevealedSignal = {
      slug: "ai-generated",
      name: "AI generated",
      type: "signal",
      applies: 3,
      disputes: 0,
      trusted: false,
      revealed: true,
    };
    const tags: BookTagsR = { ...EMPTY, signals: [revealedSignal] };
    renderControl(tags);
    // The revealed tag name is shown…
    expect(await screen.findByText(/AI generated/i)).toBeInTheDocument();
    // …attributed to a review (honest "reviewed" framing), NOT "community consensus".
    expect(screen.getByText(/review/i)).toBeInTheDocument();
    expect(screen.queryByText(/community consensus/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/trusted consensus/i)).not.toBeInTheDocument();
  });

  it("does NOT show a curator count / apply tally on the revealed accusatory chip", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    const revealedSignal: RevealedSignal = {
      slug: "ai-generated",
      name: "AI generated",
      type: "signal",
      applies: 7,
      disputes: 2,
      trusted: false,
      revealed: true,
    };
    const tags: BookTagsR = { ...EMPTY, signals: [revealedSignal] };
    const { container } = renderControl(tags);
    await screen.findByText(/AI generated/i);
    // The "7" apply count and "2" dispute count must not be surfaced as a tally
    // (gate decision 4 / AC-5 — no "a dozen people said so" headcount framing).
    expect(container.textContent).not.toMatch(/\b7\b/);
    expect(container.textContent).not.toMatch(/\b2\b/);
  });
});
