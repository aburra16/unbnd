// FAILING TESTS — Story 93 / ADR 0084: guide pages render the site chrome.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GuideLanding } from "../../src/routes/GuideLanding";
import { GuideSection } from "../../src/routes/GuideSection";
import { GuideProvider } from "../../src/guide/GuideContext";
import { loadGuide } from "../../src/guide/load";

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));
sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });

const ENTRY = `---
anchor: the-entry
name: The entry
order: 1
---

A body long enough to publish.
`;

function renderAt(path: string) {
  return render(
    <GuideProvider value={loadGuide({ "./content/getting-started/1-the-entry.md": ENTRY })}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/guide" element={<GuideLanding />} />
          <Route path="/guide/:section" element={<GuideSection />} />
        </Routes>
      </MemoryRouter>
    </GuideProvider>,
  );
}

describe("guide pages carry the site chrome (Story 93 / ADR 0084 §4)", () => {
  it("the landing renders the top nav and the footer", () => {
    const { container } = renderAt("/guide");
    expect(container.querySelector("nav.nav")).not.toBeNull();
    expect(container.querySelector("footer.footer")).not.toBeNull();
  });

  it("a section page renders the top nav and the footer", () => {
    const { container } = renderAt("/guide/getting-started");
    expect(container.querySelector("nav.nav")).not.toBeNull();
    expect(container.querySelector("footer.footer")).not.toBeNull();
  });
});
