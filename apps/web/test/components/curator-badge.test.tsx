// Failing tests (red) for Story 67 / ADR 0066 — the CuratorBadge on a profile.
// Resolves the owner's curator status and shows a "Curator" label when they are a
// curator, nothing otherwise. The badge is a stub today → the positive case is red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CuratorBadge } from "../../src/components/CuratorBadge";

const curatorStatusMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  api: { profile: { curatorStatus: (...a: unknown[]) => curatorStatusMock(...a) } },
}));

const NPUB = "npub1curator000000000000000000000000000000000000000000000000000";

beforeEach(() => curatorStatusMock.mockReset());
afterEach(() => vi.clearAllMocks());

describe("CuratorBadge", () => {
  it("shows a Curator badge when the profile owner is a curator", async () => {
    curatorStatusMock.mockResolvedValue({ isCurator: true });
    render(<CuratorBadge npub={NPUB} />);
    expect(await screen.findByText(/curator/i)).toBeInTheDocument();
  });

  it("renders nothing when the owner is not a curator", async () => {
    curatorStatusMock.mockResolvedValue({ isCurator: false });
    const { container } = render(<CuratorBadge npub={NPUB} />);
    await Promise.resolve();
    expect(container).toBeEmptyDOMElement();
  });
});
