import { describe, expect, it, vi, beforeEach } from "vitest";
// GuideLink (Story 92) puts a router Link inside these components.
import { MemoryRouter } from "react-router-dom";
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
    render(<MemoryRouter><PoVBar /></MemoryRouter>);
    expect(screen.getByText(/Unbnd house view/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /personalize/i })).not.toBeInTheDocument();
  });

  it("none: Personalize button triggers personalize()", () => {
    const personalize = vi.fn();
    trustMock.mockReturnValue(trust({ status: "none", personalize }));
    render(<MemoryRouter><PoVBar /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: /personalize/i }));
    expect(personalize).toHaveBeenCalled();
  });

  // ADR 0026 (AC-4): a custodial user below the follow gate sees an honest
  // prompt and NO Personalize affordance.
  it("gated: shows the follow-a-few-curators prompt, no Personalize button", () => {
    trustMock.mockReturnValue(trust({ status: "gated" }));
    render(<MemoryRouter><PoVBar /></MemoryRouter>);
    expect(screen.getByText(/follow a few curators/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /personalize/i })).not.toBeInTheDocument();
  });

  it("building: shows the building state", () => {
    trustMock.mockReturnValue(trust({ status: "building" }));
    render(<MemoryRouter><PoVBar /></MemoryRouter>);
    expect(screen.getByText(/web of trust/i)).toBeInTheDocument();
  });

  it("ready + yours: personalized indicator + House/Yours toggle", () => {
    trustMock.mockReturnValue(trust({ status: "ready", view: "yours" }));
    render(<MemoryRouter><PoVBar /></MemoryRouter>);
    expect(screen.getByText(/your perspective/i)).toBeInTheDocument();
    expect(screen.getByText(/personalized/i)).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /house/i })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /yours/i })).toBeInTheDocument();
  });

  it("ready + house: shows house label; switching calls setView", () => {
    const setView = vi.fn();
    trustMock.mockReturnValue(trust({ status: "ready", view: "house", setView }));
    render(<MemoryRouter><PoVBar /></MemoryRouter>);
    expect(screen.getByText(/Unbnd house view/i)).toBeInTheDocument();
    expect(screen.queryByText(/personalized/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: /yours/i }));
    expect(setView).toHaveBeenCalledWith("yours");
  });
});
