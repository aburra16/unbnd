import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { PoVBar } from "../../src/components/PoVBar";

const trustMock = vi.fn();
vi.mock("../../src/hooks/useTrustView", () => ({ useTrustView: () => trustMock() }));

function trust(over: Record<string, unknown> = {}) {
  return { status: "house-only", view: "house", setView: vi.fn(), personalize: vi.fn(), error: null, npub: undefined, ...over };
}

beforeEach(() => trustMock.mockReset());

describe("PoVBar", () => {
  it("house-only: shows the house view, no Personalize", () => {
    trustMock.mockReturnValue(trust());
    render(<PoVBar />);
    expect(screen.getByText(/Unbnd house view/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /personalize/i })).not.toBeInTheDocument();
  });

  it("none: Personalize button triggers personalize()", () => {
    const personalize = vi.fn();
    trustMock.mockReturnValue(trust({ status: "none", personalize }));
    render(<PoVBar />);
    fireEvent.click(screen.getByRole("button", { name: /personalize/i }));
    expect(personalize).toHaveBeenCalled();
  });

  it("building: shows the building state", () => {
    trustMock.mockReturnValue(trust({ status: "building" }));
    render(<PoVBar />);
    expect(screen.getByText(/web of trust/i)).toBeInTheDocument();
  });

  it("ready: shows the personalized indicator", () => {
    trustMock.mockReturnValue(trust({ status: "ready" }));
    render(<PoVBar />);
    expect(screen.getByText(/your perspective/i)).toBeInTheDocument();
    expect(screen.getByText(/personalized/i)).toBeInTheDocument();
  });
});
