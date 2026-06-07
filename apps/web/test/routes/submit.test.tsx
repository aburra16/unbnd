import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Submit } from "../../src/routes/Submit";
import type { UseSession } from "../../src/hooks/useSession";

// Drive the dedup gate with a stub that proceeds immediately.
vi.mock("../../src/components/DuplicateCheck", () => ({
  DuplicateCheck: ({ onProceed }: { onProceed: (p: { title: string }) => void }) => (
    <button type="button" onClick={() => onProceed({ title: "My New Book" })}>
      proceed-stub
    </button>
  ),
}));

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

const createCustodial = vi.fn();
const template = vi.fn();
const create = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: {
      createCustodial: (...a: unknown[]) => createCustodial(...a),
      template: (...a: unknown[]) => template(...a),
      create: (...a: unknown[]) => create(...a),
    },
    // Nav/AccountMenu use these when signed-in.
    profile: { get: vi.fn(async () => ({ profile: { npub: "npub1me" } })) },
    auth: { logout: vi.fn(async () => {}) },
  },
}));

const custodial = { id: "u", email: "a@b.com", displayName: "n", npub: "npub1me" };

beforeEach(() => {
  sessionMock.mockReset();
  createCustodial.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => vi.clearAllMocks());

function renderSubmit() {
  render(
    <MemoryRouter>
      <Submit />
    </MemoryRouter>,
  );
}

describe("Submit — search-first gating", () => {
  it("hides the form until proceed; prefills the title; back hides it again", () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodial, refresh: vi.fn() });
    renderSubmit();
    expect(screen.queryByRole("heading", { name: /Book details/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /proceed-stub/i }));
    expect(screen.getByRole("heading", { name: /Book details/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toHaveValue("My New Book");
    fireEvent.click(screen.getByRole("button", { name: /back to search/i }));
    expect(screen.queryByRole("heading", { name: /Book details/i })).not.toBeInTheDocument();
  });
});

describe("Submit — publish (custodial)", () => {
  it("submits the intent and shows the success state", async () => {
    sessionMock.mockReturnValue({ status: "signed-in", user: custodial, refresh: vi.fn() });
    renderSubmit();
    fireEvent.click(screen.getByRole("button", { name: /proceed-stub/i }));
    fireEvent.change(screen.getByLabelText(/author name/i), { target: { value: "Ada" } });
    fireEvent.click(screen.getByRole("button", { name: /^submit book$/i }));
    await waitFor(() =>
      expect(createCustodial).toHaveBeenCalledWith(
        expect.objectContaining({ title: "My New Book", authorName: "Ada" }),
      ),
    );
    expect(await screen.findByRole("heading", { name: /Submission received/i })).toBeInTheDocument();
  });

  it("blocks submit and shows the create-account prompt when signed out (Story 73)", () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    renderSubmit();
    fireEvent.click(screen.getByRole("button", { name: /proceed-stub/i }));
    expect(screen.getByRole("button", { name: /^submit book$/i })).toBeDisabled();
    expect(screen.getByText(/create a free account to submit a book\./i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /create account/i })).toHaveAttribute("href", "/auth");
  });
});
