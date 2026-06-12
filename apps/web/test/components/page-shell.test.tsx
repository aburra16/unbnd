// FAILING TESTS — Story 96 / ADR 0086: the chrome/content frame split.
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Container } from "@unbnd/ui";
import { PageShell } from "../../src/components/PageShell";

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));
sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });

describe("Container frames (ADR 0086 §2)", () => {
  it("default frame emits class=page, byte-identical to the ADR 0049 contract", () => {
    const { container } = render(<Container>x</Container>);
    expect(container.firstElementChild!.className).toBe("page");
  });

  it('frame="chrome" emits the chrome row, with className still additive', () => {
    const { container } = render(
      <Container frame="chrome" className="nav-row">x</Container>,
    );
    expect(container.firstElementChild!.className).toBe("chrome-row nav-row");
  });
});

describe("PageShell (ADR 0086 §4): one composition site for the chrome", () => {
  it("renders nav bar, page container with the children, footer — in order", () => {
    const { container } = render(
      <MemoryRouter>
        <PageShell>
          <p>the content</p>
        </PageShell>
      </MemoryRouter>,
    );
    const kids = Array.from(container.children).map((el) => el.tagName + "." + el.className.split(" ")[0]);
    expect(kids).toEqual(["NAV.nav", "DIV.page", "FOOTER.footer"]);
    expect(container.querySelector(".page p")!.textContent).toBe("the content");
  });

  it("the nav bar and footer bar each wrap a centered chrome row (full-bleed bar, bounded row)", () => {
    const { container } = render(
      <MemoryRouter>
        <PageShell>x</PageShell>
      </MemoryRouter>,
    );
    expect(container.querySelector("nav.nav > .chrome-row")).not.toBeNull();
    expect(container.querySelector("footer.footer > .chrome-row")).not.toBeNull();
  });
});
