// FAILING TESTS — Story 84 / ADR 0081 (the guide routes + frame).
//
// Components take the loaded guide through a provider seam so fixtures stand
// in for the (still empty) real content. Pins: the landing lists published
// sections only; section pages render the four-part anatomy under stable
// anchor ids with the rail + next/previous; unknown or empty sections
// redirect to /guide (never an error page); an anchor hash scrolls to its
// entry; a bad anchor stays at the section top.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GuideLanding } from "../../src/routes/GuideLanding";
import { GuideSection } from "../../src/routes/GuideSection";
import { GuideProvider } from "../../src/guide/GuideContext";
import { loadGuide } from "../../src/guide/load";

const entry = (anchor: string, name: string, order: number, body: string) =>
  `---\nanchor: ${anchor}\nname: ${name}\norder: ${order}\n---\n\n${body}\n`;

const FIXTURE = loadGuide({
  "./content/getting-started/1-your-first-session.md": entry(
    "your-first-session",
    "Your first session",
    1,
    "**What it is.** The first four moves.\n\n1. Rate a few books.\n2. Save one to a shelf.",
  ),
  "./content/ratings-you-can-trust/1-taste-match.md": entry(
    "taste-match",
    "Taste match",
    1,
    "**What it is.** A percentage.",
  ),
  "./content/ratings-you-can-trust/2-house-view.md": entry(
    "house-view",
    "Unbnd house view",
    2,
    "**What it is.** The staff picks shelf.",
  ),
});

function renderAt(path: string, guide = FIXTURE) {
  return render(
    <GuideProvider value={guide}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/guide" element={<GuideLanding />} />
          <Route path="/guide/:section" element={<GuideSection />} />
        </Routes>
      </MemoryRouter>
    </GuideProvider>,
  );
}

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.clearAllMocks());

describe("GuideLanding — published sections only", () => {
  it("lists published sections with their entry names; unpublished sections are absent", () => {
    renderAt("/guide");
    expect(screen.getByRole("link", { name: /ratings you can trust/i })).toBeInTheDocument();
    expect(screen.getByText("Taste match")).toBeInTheDocument();
    expect(screen.queryByText(/for curators/i)).not.toBeInTheDocument();
  });

  it("an empty guide renders the title and no section links", () => {
    renderAt("/guide", loadGuide({}));
    expect(screen.getByRole("heading", { name: /guide/i })).toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
});

describe("GuideSection — the anatomy, the rail, the walk", () => {
  it("renders entries under their stable anchor ids with headings named by the on-screen words", () => {
    const { container } = renderAt("/guide/ratings-you-can-trust");
    const tm = container.querySelector("#taste-match");
    expect(tm).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Taste match" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unbnd house view" })).toBeInTheDocument();
  });

  it("renders the formatted anatomy: bold labels and numbered steps", () => {
    renderAt("/guide/getting-started");
    expect(screen.getByText("What it is.")).toBeInTheDocument();
    expect(screen.getByText("Rate a few books.")).toBeInTheDocument();
    expect(screen.getByText("Save one to a shelf.")).toBeInTheDocument();
  });

  it("the rail lists the section's entries; next/previous walk the published order", () => {
    renderAt("/guide/getting-started");
    expect(screen.getByRole("navigation", { name: /in this section|contents/i })).toBeInTheDocument();
    // getting-started is first of two published sections: no previous, next exists.
    expect(screen.queryByRole("link", { name: /previous/i })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /ratings you can trust/i })).toHaveAttribute(
      "href",
      "/guide/ratings-you-can-trust",
    );
  });

  it("an anchor hash scrolls to its entry after render", async () => {
    renderAt("/guide/ratings-you-can-trust#house-view");
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });

  it("a bad anchor stays at the section top (no scroll, no error)", () => {
    renderAt("/guide/ratings-you-can-trust#never-published");
    expect(screen.getByRole("heading", { name: "Taste match" })).toBeInTheDocument();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("an unknown section redirects to the landing", () => {
    renderAt("/guide/not-a-section");
    expect(screen.getByRole("heading", { name: /guide/i })).toBeInTheDocument();
  });

  it("a published-empty section redirects to the landing too", () => {
    renderAt("/guide/for-curators");
    expect(screen.getByRole("heading", { name: /guide/i })).toBeInTheDocument();
  });
});
