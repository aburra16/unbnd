// FAILING TESTS — Story 94 / ADR 0085: the docs tree.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { GuideTree } from "../../src/guide/GuideTree";
import { GuideLanding } from "../../src/routes/GuideLanding";
import { GuideSection } from "../../src/routes/GuideSection";
import { GuideProvider } from "../../src/guide/GuideContext";
import { loadGuide } from "../../src/guide/load";

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));
sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });

const entry = (anchor: string, name: string, order: number) => `---
anchor: ${anchor}
name: ${name}
order: ${order}
---

A body long enough to publish for ${name}.
`;

const RAW = {
  "./content/getting-started/1-creating-an-account.md": entry("creating-an-account", "Creating an account", 1),
  "./content/getting-started/2-signing-in.md": entry("signing-in", "Signing in", 2),
  "./content/finding-books/1-the-book-page.md": entry("the-book-page", "The book page", 1),
};

const guide = loadGuide(RAW);

function renderTree(props: { currentSlug?: string; activeAnchor?: string } = {}) {
  return render(
    <MemoryRouter>
      <GuideTree sections={guide.published} currentSlug={props.currentSlug} activeAnchor={props.activeAnchor} />
    </MemoryRouter>,
  );
}

describe("GuideTree — one tree everywhere (ADR 0085 §1–3)", () => {
  it("lists every published section with its entries as sub-links, whatever the current page", () => {
    renderTree({ currentSlug: "finding-books" });
    expect(screen.getByText("Getting started")).toBeInTheDocument();
    expect(screen.getByText("Finding books")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "The book page" })).toHaveAttribute(
      "href",
      "/guide/finding-books#the-book-page",
    );
  });

  it("expands only the current section on arrival; the rest start collapsed", () => {
    const { container } = renderTree({ currentSlug: "finding-books" });
    const groups = Array.from(container.querySelectorAll("details"));
    expect(groups.length).toBe(2);
    const open = groups.filter((d) => d.open).map((d) => d.querySelector("summary")?.textContent);
    expect(open).toEqual(["Finding books"]);
  });

  it("a collapsed section expands on toggle (native disclosure)", () => {
    const { container } = renderTree({ currentSlug: "finding-books" });
    const closed = Array.from(container.querySelectorAll("details")).find((d) => !d.open)!;
    fireEvent.click(closed.querySelector("summary")!);
    expect(closed.open).toBe(true);
  });

  it("marks the current section and puts aria-current on the active entry link", () => {
    renderTree({ currentSlug: "getting-started", activeAnchor: "signing-in" });
    const summary = screen.getByText("Getting started").closest("summary");
    expect(summary?.className).toContain("guide-tree-current");
    expect(screen.getByRole("link", { name: "Signing in" })).toHaveAttribute("aria-current", "location");
    expect(screen.getByRole("link", { name: "Creating an account" })).not.toHaveAttribute("aria-current");
  });
});

function renderAt(path: string) {
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

describe("the tree is on every guide page (ADR 0085 §1, §4)", () => {
  it("the landing renders the tree, no section current", () => {
    const { container } = renderAt("/guide");
    const tree = container.querySelector(".guide-tree");
    expect(tree).not.toBeNull();
    expect(tree!.querySelectorAll("details").length).toBe(2);
    expect(Array.from(tree!.querySelectorAll("details")).some((d) => d.open)).toBe(false);
  });

  it("a section page renders the tree with the URL anchor as the initial active entry", () => {
    const { container } = renderAt("/guide/getting-started#signing-in");
    const active = container.querySelector('.guide-tree a[aria-current="location"]');
    expect(active).not.toBeNull();
    expect(active!.textContent).toBe("Signing in");
  });

  it("the old per-section rail is gone", () => {
    const { container } = renderAt("/guide/getting-started");
    expect(container.querySelector('[aria-label="In this section"]')).toBeNull();
  });
});
