// FAILING TESTS — Story 85 / ADR 0082 (the narrative + the doors).
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GuideLanding } from "../../src/routes/GuideLanding";
import { GuideProvider } from "../../src/guide/GuideContext";
import { loadGuide } from "../../src/guide/load";
import { Footer } from "../../src/components/Footer";

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));
sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });

const LANDING = `---
slot: landing
---

We built Unbnd so a recommendation can come from a person.

## Your first session

1. Rate a few books you know well.
2. Save one to a shelf.

## If you curate

Your ratings carry weight here.
`;

function renderLanding(raw: Record<string, string>) {
  return render(
    <GuideProvider value={loadGuide(raw)}>
      <MemoryRouter initialEntries={["/guide"]}>
        <Routes>
          <Route path="/guide" element={<GuideLanding />} />
        </Routes>
      </MemoryRouter>
    </GuideProvider>,
  );
}

describe("the landing narrative (ADR 0082 §1–2)", () => {
  it("loadGuide recognizes content/landing.md as the landing slot, not an entry", () => {
    const guide = loadGuide({ "./content/landing.md": LANDING });
    expect(guide.landing).toContain("We built Unbnd");
    expect(guide.published).toEqual([]);
  });

  it("renders the narrative with real headings and steps above the contents", () => {
    renderLanding({ "./content/landing.md": LANDING });
    expect(screen.getByText(/we built unbnd so a recommendation/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Your first session" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "If you curate" })).toBeInTheDocument();
    expect(screen.getByText("Rate a few books you know well.")).toBeInTheDocument();
  });

  it("without a landing file the spare scaffold still renders (no crash, title only)", () => {
    renderLanding({});
    expect(screen.getByRole("heading", { name: /reader's guide/i })).toBeInTheDocument();
  });
});

describe("the doors (ADR 0082 §3)", () => {
  it("the footer carries a Guide link beside About, site-wide", () => {
    render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    );
    expect(screen.getByRole("link", { name: "Guide" })).toHaveAttribute("href", "/guide");
    expect(screen.getByRole("link", { name: "About" })).toBeInTheDocument();
  });
});
