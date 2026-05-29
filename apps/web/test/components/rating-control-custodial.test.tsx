import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { RatingControl } from "../../src/components/RatingControl";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const templateMock = vi.fn();
const submitMock = vi.fn();
const submitCustodialMock = vi.fn();
const listMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    ratings: {
      template: (...a: unknown[]) => templateMock(...a),
      submit: (...a: unknown[]) => submitMock(...a),
      submitCustodial: (...a: unknown[]) => submitCustodialMock(...a),
      list: (...a: unknown[]) => listMock(...a),
    },
  },
}));

const signEvent = vi.fn();
const custodialUser = {
  id: "u1",
  email: "reader@example.com",
  displayName: "reader",
  npub: "npub1readerxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxq9",
};

beforeEach(() => {
  templateMock.mockReset();
  submitMock.mockReset();
  submitCustodialMock.mockReset();
  listMock.mockReset().mockResolvedValue({ count: 0, average: null, ratings: [] });
  signEvent.mockReset();
  sessionMock.mockReset();
  (window as unknown as { nostr: unknown }).nostr = { signEvent };
});
afterEach(() => {
  delete (window as unknown as { nostr?: unknown }).nostr;
});

function renderControl() {
  return render(
    <MemoryRouter>
      <RatingControl bookSlug="orbital" />
    </MemoryRouter>,
  );
}

describe("RatingControl — custodial (email) session", () => {
  it("rates via server-side submit, with no extension signing", async () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: custodialUser,
      refresh: vi.fn(),
    });
    submitCustodialMock.mockResolvedValue({
      rating: { score: 4, reviewDate: "2026-05-29" },
      summary: { count: 1, average: 4, ratings: [] },
    });

    renderControl();
    fireEvent.click(await screen.findByRole("button", { name: /rate 4 of 5/i }));
    fireEvent.click(screen.getByRole("button", { name: /submit rating/i }));

    await waitFor(() => expect(submitCustodialMock).toHaveBeenCalled());
    const arg = submitCustodialMock.mock.calls[0]![0] as {
      bookSlug: string;
      score: number;
    };
    expect(arg.bookSlug).toBe("orbital");
    expect(arg.score).toBe(4);
    // Custodial path must NOT touch the extension or the sovereign endpoints.
    expect(signEvent).not.toHaveBeenCalled();
    expect(templateMock).not.toHaveBeenCalled();
    expect(submitMock).not.toHaveBeenCalled();
  });
});
