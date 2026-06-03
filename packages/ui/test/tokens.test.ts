// Smoke test for the Story-38 beachhead: the design-system token stylesheet
// ships from @unbnd/ui (not apps/web) and still carries the core brand tokens.
// This is the real deliverable of the scaffold; richer token guards arrive with
// the two-tier token migration (Epic 0001, repo Story 40).
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const TOKENS = resolve(__dirname, "..", "styles", "tokens.css");

describe("@unbnd/ui token stylesheet", () => {
  it("ships the token stylesheet from the package", () => {
    expect(existsSync(TOKENS)).toBe(true);
  });

  it("defines the core brand tokens (relocated unchanged)", () => {
    const css = readFileSync(TOKENS, "utf8");
    expect(css).toContain("--u-amber: #C4763C");
    expect(css).toContain("--u-ink: #1A1A2E");
    expect(css).toContain("--u-parchment: #FAF6F0");
  });
});
