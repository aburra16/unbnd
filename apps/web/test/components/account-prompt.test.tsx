// Story 73 / ADR 0071 — the shared write-gate account prompt. One component,
// keyed by an `action`, renders a consistent "Create a free account to <phrase>."
// line (AC-4 framing + AC-5 unlock) and a "Create account" CTA routing to /auth.
//
// FAILING until `apps/web/src/components/AccountPrompt.tsx` exists.
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AccountPrompt, type AccountAction } from "../../src/components/AccountPrompt";

function renderPrompt(action: AccountAction) {
  return render(
    <MemoryRouter>
      <AccountPrompt action={action} />
    </MemoryRouter>,
  );
}

const CASES: Array<[AccountAction, RegExp]> = [
  ["rate", /create a free account to rate this book\./i],
  ["save", /create a free account to save this book to a shelf\./i],
  ["follow", /create a free account to follow this curator\./i],
  ["vouch", /create a free account to vouch for this curator\./i],
  ["tag", /create a free account to suggest a genre or style\./i],
  ["submit", /create a free account to submit a book\./i],
];

describe("AccountPrompt — create-account framing + per-action unlock (AC-4/AC-5)", () => {
  it.each(CASES)("action=%s shows the create-a-free-account line naming the unlock", (action, copy) => {
    renderPrompt(action);
    expect(screen.getByText(copy)).toBeInTheDocument();
  });

  it("routes the Create-account CTA to /auth (AC-4)", () => {
    renderPrompt("rate");
    const cta = screen.getByRole("link", { name: /create account/i });
    expect(cta).toHaveAttribute("href", "/auth");
  });

  it("is a note affordance, never a sign-in-only label", () => {
    const { container } = renderPrompt("follow");
    const note = container.querySelector('[role="note"]') ?? container.firstElementChild!;
    // The message leads with creating an account, not 'Sign in'.
    expect(within(note as HTMLElement).queryByText(/^sign in/i)).not.toBeInTheDocument();
    expect(within(note as HTMLElement).getByText(/create a free account/i)).toBeInTheDocument();
  });

  it("uses no AI-slop punctuation in the copy (no em dash)", () => {
    const { container } = renderPrompt("vouch");
    expect(container.textContent ?? "").not.toContain("—");
  });
});
