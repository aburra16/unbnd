// Story 99 / ADR 0089: a review written in another app may give words and no
// stars. It is listed with its words and no star row, never as zero stars.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ReviewsList } from "../../src/components/ReviewsList";

vi.mock("../../src/hooks/useProfileMeta", () => ({
  useProfileMeta: () => null,
  displayNameOf: (_meta: unknown, npub: string) => npub.slice(0, 12),
}));

describe("ReviewsList: a review without stars", () => {
  it("shows the words and no stars", () => {
    const { container } = render(
      <MemoryRouter>
        <ReviewsList
          ratings={[
            { npub: "npub1n0ewa4w877phxhqxu5v02mhmj6aanc7mm93w9attfjc5etcstkzql9rk23", score: null, reviewText: "Only words.", reviewDate: "2026-10-20" },
          ]}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText("Only words.")).toBeInTheDocument();
    expect(container.querySelector(".review-stars")).toBeNull();
    expect(container.textContent).not.toMatch(/☆☆☆☆☆/);
  });
});
