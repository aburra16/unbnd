// Story 78 / ADR 0076 (web) — the curator reveal/withdraw control on accusatory
// tags in TagControl. A `gated: true` tag (curator-only) shows a Reveal action; a
// `revealed: true` tag shows a Withdraw action; both call api.tags.reveal.
// FAILING until TagControl renders the controls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TagControl } from "../../src/components/TagControl";
import type { BookTags } from "../../src/lib/api";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const revealMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    tags: {
      list: vi.fn(),
      template: vi.fn(),
      submit: vi.fn(),
      submitCustodial: vi.fn(),
      reveal: (...a: unknown[]) => revealMock(...a),
    },
  },
}));

const curator = {
  id: "u1",
  email: null,
  displayName: "Reader",
  npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23",
};

beforeEach(() => {
  sessionMock.mockReset().mockReturnValue({ status: "signed-in", user: curator, refresh: vi.fn() });
  revealMock.mockReset().mockResolvedValue({ status: "queued" });
});
afterEach(() => vi.clearAllMocks());

function renderControl(tags: BookTags) {
  return render(
    <MemoryRouter>
      <TagControl bookSlug="orbital" tags={tags} />
    </MemoryRouter>,
  );
}

const gatedTags: BookTags = {
  genres: [],
  styles: [],
  signals: [
    { slug: "ai-generated", name: "AI generated", type: "signal", applies: 2, disputes: 0, trusted: true, gated: true },
  ],
  canAssertAccusatory: true,
};

const revealedTags: BookTags = {
  genres: [],
  styles: [],
  signals: [
    { slug: "ai-generated", name: "AI generated", type: "signal", applies: 2, disputes: 0, trusted: true, revealed: true },
  ],
  canAssertAccusatory: true,
};

describe("TagControl — curator reveal control (Story 78)", () => {
  it("offers a Reveal action on a gated accusatory tag and calls api.tags.reveal", async () => {
    renderControl(gatedTags);
    const btn = await screen.findByRole("button", { name: /reveal/i });
    fireEvent.click(btn);
    await waitFor(() => expect(revealMock).toHaveBeenCalledWith("orbital", "ai-generated", "revealed"));
  });

  it("offers a Withdraw action on a revealed accusatory tag and calls api.tags.reveal(withdrawn)", async () => {
    renderControl(revealedTags);
    const btn = await screen.findByRole("button", { name: /withdraw/i });
    fireEvent.click(btn);
    await waitFor(() => expect(revealMock).toHaveBeenCalledWith("orbital", "ai-generated", "withdrawn"));
  });

  it("a non-curator never sees the gated tag or a reveal control", async () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    // Public payload: no gated tag, no canAssertAccusatory.
    renderControl({ genres: [], styles: [], signals: [] });
    expect(screen.queryByRole("button", { name: /reveal/i })).not.toBeInTheDocument();
  });
});
