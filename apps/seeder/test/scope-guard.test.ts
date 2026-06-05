// Scope-guard (negative) tests for Story 55, per ADR 0054 "Out of scope" and
// the story's explicit boundary: Story 55 adds NO relay-read capability and
// publishes NO kind-5. The prune (relay read -> diff -> NIP-09 kind-5 delete)
// is Story 56 / ADR 0055.
//
// These lock the scope boundary so the Implementer does not drift into Story 56.
// They are intentionally light and structural: they read the seeder source and
// assert the prune surfaces are ABSENT. They are GREEN today and must stay
// green for Story 55; a kind-5 builder, a relay reader (apps/seeder/src/read.ts),
// or a relay REQ import in the seeder would turn them red — the intended signal.
import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");
const indexSrc = readFileSync(join(srcDir, "index.ts"), "utf8");

describe("Story 55 scope guard — no relay-read capability", () => {
  it("does not add a relay reader module (apps/seeder/src/read.ts is Story 56)", () => {
    expect(existsSync(join(srcDir, "read.ts"))).toBe(false);
  });

  it("the seeder issues no relay REQ / subscription (publish-only, as today)", () => {
    // The seeder talks to the relay only to publish. A REQ / subscribe is the
    // read path the prune (Story 56) would introduce.
    const files = readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      const text = readFileSync(join(srcDir, f), "utf8");
      expect(text).not.toMatch(/\bqueryAllPages\b/);
      expect(text).not.toMatch(/"REQ"|'REQ'/);
    }
  });
});

describe("Story 55 scope guard — no kind-5 publish", () => {
  it("the seeder builds no NIP-09 kind-5 deletion template", () => {
    // A kind-5 deletion is the Story-56 prune. No kind:5 / kind: 5 template here.
    expect(indexSrc).not.toMatch(/kind:\s*5\b/);
  });

  it("the seeder publishes no 'delete' / prune step", () => {
    expect(indexSrc).not.toMatch(/\bprune\b/i);
    // The neutral kind-5 content string the prune would carry (ADR §"Deferred
    // to Story 56") must not appear in this story.
    expect(indexSrc).not.toContain("Removed by catalog legitimacy re-gate");
  });
});
