// Story 113 / ADR 0101 §6: the line loads its look from brainstorm.world as a
// stylesheet. Unbnd sends no Content Security Policy today. If one is ever
// added, to the app's page or its Caddy site, it must let that stylesheet in,
// or Brainstorm's restyles stop reaching Unbnd without anything failing.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO = resolve(__dirname, "..", "..", "..");
const SERVED = ["apps/web/index.html", "deploy/Caddyfile"];
const ORIGIN = "https://brainstorm.world";

/** The policies a file sets, as their raw text. */
function policies(text: string): string[] {
  const found: string[] = [];
  for (const [tag] of text.matchAll(/<meta\b[^>]*>/gi)) {
    if (!/http-equiv=(["'])Content-Security-Policy\1/i.test(tag)) continue;
    const content = tag.match(/content=(["'])(.*?)\1/i);
    if (content) found.push(content[2]);
  }
  // Caddy takes a value in double quotes, or in backticks across lines.
  for (const m of text.matchAll(/Content-Security-Policy\s+(["`])([\s\S]*?)\1/gi)) found.push(m[2].replace(/\s+/g, " "));
  return found;
}

/** Whether a policy lets a stylesheet from brainstorm.world load (style-src-elem, then style-src, then default-src). */
function allowsBrainstormStyles(policy: string): boolean {
  const directives = new Map(
    policy
      .split(";")
      .map((d) => d.trim().split(/\s+/))
      .filter((parts) => parts[0])
      .map(([name, ...sources]) => [name.toLowerCase(), sources]),
  );
  const sources = directives.get("style-src-elem") ?? directives.get("style-src") ?? directives.get("default-src");
  if (!sources) return true;
  return sources.some((s) => s === ORIGIN || s === `${ORIGIN}/` || s === "https:" || s === "*");
}

describe("the policy check", () => {
  it("reads which policies let brainstorm.world's stylesheet in", () => {
    expect(allowsBrainstormStyles("img-src 'self'")).toBe(true);
    expect(allowsBrainstormStyles("default-src 'self'")).toBe(false);
    expect(allowsBrainstormStyles("default-src 'self'; style-src 'self' https://brainstorm.world")).toBe(true);
    expect(allowsBrainstormStyles("style-src 'self'; default-src https://brainstorm.world")).toBe(false);
    expect(allowsBrainstormStyles("style-src 'self' https://brainstorm.world; style-src-elem 'self'")).toBe(false);
  });

  it("finds a policy in a page's meta tag and in a Caddy header line", () => {
    expect(policies(`<meta http-equiv="Content-Security-Policy" content="default-src 'self'">`)).toEqual(["default-src 'self'"]);
    expect(policies(`\t\theader Content-Security-Policy "default-src 'self'; style-src 'self'"`)).toEqual([
      "default-src 'self'; style-src 'self'",
    ]);
    expect(policies("header {\n\tContent-Security-Policy `default-src 'self';\n\t\tstyle-src 'self'`\n}")).toEqual([
      "default-src 'self'; style-src 'self'",
    ]);
  });
});

describe("what Unbnd is served with", () => {
  it("lets the line's stylesheet in, under any policy the app's page or its Caddy site sets", () => {
    const blocked = SERVED.flatMap((file) =>
      policies(readFileSync(resolve(REPO, file), "utf8"))
        .filter((policy) => !allowsBrainstormStyles(policy))
        .map((policy) => `${file}: ${policy}`),
    );
    expect(blocked).toEqual([]);
  });
});
