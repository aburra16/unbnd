// Story 113 / ADR 0101 §5: where the line sits. Once at the foot of every
// page: the footer bar's own row on standard pages, under the card on the
// sign-in pages. Every route composes one of the two shells that draw it.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PageShell } from "../../src/components/PageShell";
import { AuthShell } from "../../src/components/AuthShell";

const sessionMock = vi.fn();
vi.mock("../../src/hooks/useSession", () => ({ useSession: () => sessionMock() }));
sessionMock.mockReturnValue({ status: "signed-out", refresh: vi.fn() });

const SRC = resolve(__dirname, "..", "..", "src");

describe("standard pages (PageShell)", () => {
  it("carry the line once, on a chrome row of its own under the footer's row", () => {
    const { container } = render(
      <MemoryRouter>
        <PageShell>
          <p>the content</p>
        </PageShell>
      </MemoryRouter>,
    );
    const lines = container.querySelectorAll("built-on-brainstorm");
    expect(lines).toHaveLength(1);
    const row = container.querySelector("footer.footer > .footer-credit")!;
    expect(row).not.toBeNull();
    expect(row).toHaveClass("chrome-row");
    expect(row.previousElementSibling).toHaveClass("footer-row");
    expect(row.contains(lines[0])).toBe(true);
  });
});

describe("sign-in pages (AuthShell)", () => {
  it("carry the line once, under the card", () => {
    const { container } = render(
      <MemoryRouter>
        <AuthShell title="Sign in">
          <p>the form</p>
        </AuthShell>
      </MemoryRouter>,
    );
    const lines = container.querySelectorAll("built-on-brainstorm");
    expect(lines).toHaveLength(1);
    const frame = lines[0].parentElement!;
    expect(frame).toHaveClass("built-on", "auth-built-on");
    expect(frame.previousElementSibling).toHaveClass("auth-card");
    expect(frame.parentElement).toHaveClass("auth-page");
  });
});

describe("every route", () => {
  it("is a route module, imported as it is, that composes PageShell or AuthShell, so no page ships without the line", () => {
    const app = readFileSync(resolve(SRC, "App.tsx"), "utf8");
    const routes = [...app.matchAll(/import \{ (\w+) \} from "\.\/routes\/\1"/g)].map((m) => m[1]);
    expect(routes.length).toBeGreaterThanOrEqual(18);
    // Every element a <Route> draws is one of those modules: none lazy, none from elsewhere.
    const elements = [...app.matchAll(/element=\{<(\w+)/g)].map((m) => m[1]);
    expect(elements.length).toBeGreaterThanOrEqual(18);
    expect(elements.filter((name) => !routes.includes(name))).toEqual([]);
    expect(app).not.toMatch(/\blazy\s*\(|import\s*\(/);
    const bare = routes.filter((name) => {
      const source = readFileSync(resolve(SRC, "routes", `${name}.tsx`), "utf8");
      return !/<(PageShell|AuthShell)[\s>]/.test(source);
    });
    expect(bare).toEqual([]);
  });
});

describe("the footer on a phone", () => {
  it("stacks its row at 480px and below: the rule lays out the row, which carries the footer's flex layout since ADR 0086", () => {
    const css = readFileSync(resolve(SRC, "components", "Footer.css"), "utf8");
    const phone = css.match(/@media \(max-width: 480px\) \{([\s\S]*?)\n\}/)?.[1];
    expect(phone).toBeDefined();
    expect(phone).toMatch(/\.footer-row\s*\{[^}]*flex-direction:\s*column/);
    expect(phone).not.toMatch(/(^|\s)\.footer\s*\{/);
  });
});
