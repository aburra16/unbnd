import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Submit } from "../../src/routes/Submit";

// Drive the gate: a stub DuplicateCheck with a button that proceeds.
vi.mock("../../src/components/DuplicateCheck", () => ({
  DuplicateCheck: ({ onProceed }: { onProceed: (p: { title: string }) => void }) => (
    <button type="button" onClick={() => onProceed({ title: "My New Book" })}>
      proceed-stub
    </button>
  ),
}));

describe("Submit — search-first gating", () => {
  it("hides the form until the user proceeds, then prefills the title", () => {
    render(
      <MemoryRouter>
        <Submit />
      </MemoryRouter>,
    );
    // Step 1: dedup only; no form yet.
    expect(screen.getByRole("heading", { name: /Submit a book to Unbnd/i })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /Book details/i })).not.toBeInTheDocument();

    // Proceed → form appears, title prefilled.
    fireEvent.click(screen.getByRole("button", { name: /proceed-stub/i }));
    expect(screen.getByRole("heading", { name: /Book details/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/title/i)).toHaveValue("My New Book");

    // Back to search hides the form again.
    fireEvent.click(screen.getByRole("button", { name: /back to search/i }));
    expect(screen.queryByRole("heading", { name: /Book details/i })).not.toBeInTheDocument();
  });
});
