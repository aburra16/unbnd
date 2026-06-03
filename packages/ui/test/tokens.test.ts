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

  // Story 40 (ADR 0040) migrated the sheet to two tiers: the raw tier carries
  // the literal brand values, and the semantic names point at the raw tier. The
  // resolved values are byte-identical; the literal now lives on the raw token
  // and the semantic name is an alias.
  it("defines the core brand tokens (two-tier: raw literals, semantic aliases)", () => {
    const css = readFileSync(TOKENS, "utf8");
    // Tier 1: the literal lives on the raw token.
    expect(css).toContain("--u-raw-color-amber-500: #C4763C");
    expect(css).toContain("--u-raw-color-ink-900: #1A1A2E");
    expect(css).toContain("--u-raw-color-parchment-50: #FAF6F0");
    // Tier 2: the semantic name aliases the raw token (never a literal).
    expect(css).toContain("--u-amber: var(--u-raw-color-amber-500)");
    expect(css).toContain("--u-ink: var(--u-raw-color-ink-900)");
    expect(css).toContain("--u-parchment: var(--u-raw-color-parchment-50)");
  });
});
