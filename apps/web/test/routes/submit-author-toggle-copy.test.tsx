// Failing tests (red) for Story 31 / ADR 0032 §"Follow-ups" — the Submit
// "I am the author" toggle copy is now stale: it promises an "Author Verified
// badge" (Submit.tsx ~line 284), which contradicts this story's honest "claimed,
// never verified" framing (AC-7). This drives the one-line copy fix: the toggle
// must read as an authorship/claim mark and must NOT promise verification.
//
// Typed against the REAL Submit component (boundary mocks only: api / useSession /
// DuplicateCheck). Role-scoped queries. Red until the toggle copy is corrected.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Submit } from "../../src/routes/Submit";
import type { UseSession } from "../../src/hooks/useSession";

vi.mock("../../src/components/DuplicateCheck", () => ({
  DuplicateCheck: ({ onProceed }: { onProceed: (p: { title: string }) => void }) => (
    <button type="button" onClick={() => onProceed({ title: "My New Book" })}>
      proceed-stub
    </button>
  ),
}));

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));

vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    submissions: {
      createCustodial: vi.fn(async () => ({ ok: true })),
      template: vi.fn(),
      create: vi.fn(),
    },
    profile: { get: vi.fn(async () => ({ profile: { npub: "npub1me" } })) },
    auth: { logout: vi.fn(async () => {}) },
  },
}));

const custodial = { id: "u", email: "a@b.com", displayName: "n", npub: "npub1me" };

beforeEach(() => {
  sessionMock.mockReset().mockReturnValue({ status: "signed-in", user: custodial, refresh: vi.fn() });
});
afterEach(() => vi.clearAllMocks());

function openForm() {
  render(
    <MemoryRouter>
      <Submit />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole("button", { name: /proceed-stub/i }));
}

describe("Submit — 'I am the author' toggle copy is honest (AC-7)", () => {
  it("does NOT promise an 'Author Verified' badge", () => {
    openForm();
    const toggle = screen.getByLabelText(/i am the author of this book/i);
    // The description text lives near the toggle control. The whole toggle group
    // must be free of any "verified" promise.
    const group = toggle.closest("*")?.parentElement ?? document.body;
    expect(group.textContent ?? "").not.toMatch(/verified/i);
  });

  it("does not render the word 'verified' anywhere on the submit form", () => {
    openForm();
    expect(screen.queryByText(/verified/i)).not.toBeInTheDocument();
  });

  it("still reads as a claim/authorship mark (the toggle label is present)", () => {
    openForm();
    expect(screen.getByLabelText(/i am the author of this book/i)).toBeInTheDocument();
  });
});
