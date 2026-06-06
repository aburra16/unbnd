// Failing tests (red) for Story 65 / ADR 0064 — the TasteMatchChip on a public
// profile. ADR 0064, new file apps/web/src/components/TasteMatchChip.tsx:
//   - Visibility: signed-out → nothing (no taste-match query); viewing your OWN
//     profile (target === your npub) → nothing; otherwise fetch + render.
//   - Above the overlap threshold → "{percentage}% match · {n} books in common".
//   - Below the threshold → honest "Not enough overlap yet" (no number).
// The chip is a STUB today → these fail red.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { TasteMatchChip } from "../../src/components/TasteMatchChip";
import type { UseSession } from "../../src/hooks/useSession";

const sessionMock = vi.fn<() => UseSession>();
vi.mock("../../src/hooks/useSession", () => ({
  useSession: () => sessionMock(),
}));

const tasteMatchMock = vi.fn();
vi.mock("../../src/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  api: {
    profile: {
      tasteMatch: (...a: unknown[]) => tasteMatchMock(...a),
    },
  },
}));

const TARGET_NPUB =
  "npub1target00000000000000000000000000000000000000000000000000";
const VIEWER_NPUB =
  "npub1viewer00000000000000000000000000000000000000000000000000";
const viewer = { id: "u1", email: null, displayName: "Reader", npub: VIEWER_NPUB };

beforeEach(() => {
  sessionMock.mockReset();
  tasteMatchMock.mockReset();
});
afterEach(() => vi.clearAllMocks());

describe("TasteMatchChip — visibility (AC-1, AC-4)", () => {
  it("signed out → renders nothing and never queries taste match", () => {
    sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });
    const { container } = render(<TasteMatchChip target={TARGET_NPUB} />);
    expect(container).toBeEmptyDOMElement();
    expect(tasteMatchMock).not.toHaveBeenCalled();
  });

  it("viewing your OWN profile → renders nothing (no self taste-match)", () => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: { ...viewer, npub: TARGET_NPUB },
      refresh: vi.fn(),
    });
    const { container } = render(<TasteMatchChip target={TARGET_NPUB} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("TasteMatchChip — match display (AC-1, AC-3)", () => {
  beforeEach(() => {
    sessionMock.mockReturnValue({
      status: "signed-in",
      user: viewer,
      refresh: vi.fn(),
    });
  });

  it("above the threshold → shows the percentage and the count of books in common", async () => {
    tasteMatchMock.mockResolvedValue({
      signedIn: true,
      self: false,
      thresholdMet: true,
      percentage: 87,
      commonBooks: 24,
    });
    render(<TasteMatchChip target={TARGET_NPUB} />);
    expect(await screen.findByText(/87% match/i)).toBeInTheDocument();
    expect(screen.getByText(/24 books in common/i)).toBeInTheDocument();
  });

  it("below the threshold → honest 'Not enough overlap yet', no percentage", async () => {
    tasteMatchMock.mockResolvedValue({
      signedIn: true,
      self: false,
      thresholdMet: false,
      commonBooks: 2,
    });
    render(<TasteMatchChip target={TARGET_NPUB} />);
    expect(await screen.findByText(/not enough overlap yet/i)).toBeInTheDocument();
    expect(screen.queryByText(/% match/i)).not.toBeInTheDocument();
  });
});
