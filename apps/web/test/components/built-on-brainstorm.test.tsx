// Story 113 / ADR 0101: the line itself. Brainstorm's element, copied as
// Brainstorm gives it, drawn through the one wrapper that fits it with
// Unbnd's tokens and bounds it. Read through the element's shadow root.
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { BuiltOnBrainstorm } from "../../src/components/BuiltOnBrainstorm";

const COMPONENTS = resolve(__dirname, "..", "..", "src", "components");
const COPY = resolve(COMPONENTS, "built-on-brainstorm.js");
const CSS = resolve(COMPONENTS, "BuiltOnBrainstorm.css");

// Brainstorm-UI client/public/built-on/built-on-brainstorm.js, version 1, at
// staging 9cedf9c0. A newer copy is a new pin, in a PR that says why.
const COPY_SHA256 = "c769ec4498b2beb0a1c942d58a2cdf22607fe68a84f2b0a4e38127edc0952f97";

const NAME = "Built on Brainstorm (opens in a new tab)";

const sha256 = (text: string | Buffer) => createHash("sha256").update(text).digest("hex");

afterEach(cleanup);

function drawn(className?: string) {
  const { container } = render(<BuiltOnBrainstorm className={className} />);
  const host = container.querySelector("built-on-brainstorm") as HTMLElement;
  expect(host).not.toBeNull();
  const root = host.shadowRoot!;
  expect(root).not.toBeNull();
  return { container, host, root, link: root.querySelector("a")! };
}

describe("the copy (ADR 0101 §1)", () => {
  it("is Brainstorm's version 1 file, byte for byte", () => {
    expect(sha256(readFileSync(COPY))).toBe(COPY_SHA256);
  });

  it("can be loaded twice without throwing, as a second bundle or a hot reload would", () => {
    const source = readFileSync(COPY, "utf8");
    expect(() => new Function(source)()).not.toThrow();
    expect(customElements.get("built-on-brainstorm")).toBeDefined();
  });
});

describe("the line (ADR 0101 §2)", () => {
  it("is one link to Brainstorm's site, in a new tab, told nothing of where the reader came from", () => {
    const { root, link } = drawn();
    expect(root.querySelectorAll("a")).toHaveLength(1);
    expect(link).toHaveAttribute("href", "https://brainstorm.world");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("says 'Built on Brainstorm', and to a screen reader that it opens in a new tab", () => {
    const { link } = drawn();
    expect(link).toHaveAccessibleName(NAME);
    expect(link.querySelector('[part="words"]')).toHaveTextContent(/^Built on Brainstorm$/);
  });

  it("draws Brainstorm's mark before the words, as Brainstorm draws it, in the words' colour, hidden from a screen reader", () => {
    const { link } = drawn();
    const mark = link.querySelector("svg")!;
    expect(link.firstElementChild).toBe(mark);
    expect(mark).toHaveAttribute("aria-hidden", "true");
    expect(mark).toHaveAttribute("viewBox", "0 0 71 73");
    expect(mark).toHaveAttribute("fill", "currentColor");
    const path = mark.querySelector("path")!.getAttribute("d")!;
    expect(path).toHaveLength(2280);
    expect(sha256(path)).toBe("1cb58d464345120ce16678221fff92cb0f3f3dea709145d6c350143f0695b9f4");
  });

  it("takes its look from Brainstorm's site and sends it nothing of the page", () => {
    const { root } = drawn();
    const sheet = root.querySelector('link[rel="stylesheet"]');
    expect(sheet).toHaveAttribute("href", "https://brainstorm.world/built-on/v1.css");
    expect(sheet).toHaveAttribute("crossorigin", "anonymous");
    expect(sheet).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("gets its class as `class`, which React 18 passes to a custom element, so the hooks reach it", () => {
    const { host } = drawn();
    expect(host.getAttribute("class")).toBe("built-on-line");
    expect(host.hasAttribute("classname")).toBe(false);
  });
});

describe("the frame (ADR 0101 §4)", () => {
  it("sits the line alone in a bounded frame, which takes the room it is given", () => {
    const { container, host } = drawn("footer-built-on");
    const frame = host.parentElement!;
    expect(frame.tagName).toBe("SPAN");
    expect(frame).toHaveClass("built-on", "footer-built-on");
    expect(frame.children).toHaveLength(1);
    expect(container.firstElementChild).toBe(frame);
  });
});

/** The declarations of one rule in a stylesheet's text, by its exact selector. */
function rule(css: string, selector: string): Record<string, string> {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const body = css.match(new RegExp(`(^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[2];
  expect(body, `no rule for ${selector}`).toBeDefined();
  return Object.fromEntries(
    body!
      .split(";")
      .map((d) => d.trim())
      .filter((d) => d && !d.startsWith("/*"))
      .map((d) => {
        const at = d.indexOf(":");
        return [d.slice(0, at).trim(), d.slice(at + 1).trim()];
      }),
  );
}

describe("the fit (ADR 0101 §3, §4)", () => {
  it("is the footer's muted caption, the ink when pointed at or focused, with Unbnd's amber focus ring", () => {
    const css = readFileSync(CSS, "utf8");
    expect(rule(css, ".built-on-line")).toEqual({
      "font-size": "var(--u-font-size-11)",
      "--built-on-color": "var(--u-muted)",
      "--built-on-hover-color": "var(--u-ink)",
      "--built-on-focus-color": "var(--u-amber)",
    });
  });

  it("bounds the frame's paint, with room for the focus ring, and keeps the line on its row's edge", () => {
    const frame = rule(readFileSync(CSS, "utf8"), ".built-on");
    expect(frame).toMatchObject({
      contain: "paint",
      padding: "var(--u-space-4)",
      margin: "calc(-1 * var(--u-space-4))",
    });
  });

  it("never restyles the line's parts, which would cut Unbnd off from Brainstorm's restyles", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory() ? walk(resolve(dir, d.name)) : /\.(css|tsx?)$/.test(d.name) ? [resolve(dir, d.name)] : [],
      );
    const offenders = walk(resolve(COMPONENTS, "..")).filter((file) => /::part\(/.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
