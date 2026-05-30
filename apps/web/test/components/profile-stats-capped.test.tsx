// Failing tests (red) for Story 21 AC-6 (web side) — an honest "N+" cell.
// Mirrors the stat-rendering assertions in profile-me-polish.test.tsx but targets
// the ProfileStats component contract ADR 0021 Decision 2 adds: `Stat` gains an
// optional `capped?: boolean`, and `fmt` appends a trailing `+` when set, so a
// floored count renders as "10,000+". The `capped` prop does not exist yet →
// intended red.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfileStats } from "../../src/components/ProfileStats";

describe("ProfileStats — honest capped cell (AC-6)", () => {
  it("renders a capped value with a trailing + (the floored 'N+')", () => {
    render(
      <ProfileStats
        stats={[{ label: "Tags applied", value: 10000, capped: true }]}
      />,
    );
    expect(screen.getByText("10,000+")).toBeInTheDocument();
  });

  it("renders an un-capped value as the plain numeral, no +", () => {
    render(
      <ProfileStats stats={[{ label: "Books rated", value: 1960, capped: false }]} />,
    );
    expect(screen.getByText("1,960")).toBeInTheDocument();
    expect(screen.queryByText("1,960+")).not.toBeInTheDocument();
  });

  it("treats an omitted capped prop as not capped (no +)", () => {
    render(<ProfileStats stats={[{ label: "Reviews", value: 42 }]} />);
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.queryByText("42+")).not.toBeInTheDocument();
  });
});
