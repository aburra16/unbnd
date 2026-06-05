// Failing tests for Story 57 (seeder relay-publish resilience), per ADR 0056
// §3 "Wire into index.ts" + §4 "Env knobs".
//
// Light, structural wiring guard: the heavy behavior is covered by
// resilient-relay.test.ts (the layer) and publish-resilience.test.ts (the
// hardened transport). Here we only assert that the seeder ENTRY actually
// adopts the resilient layer and reads the three new env knobs, so the resilient
// code is not dead. These read the seeder source rather than executing main()
// (which needs an nsec + network), matching the scope-guard.test.ts style.
//
// RED today: index.ts still calls `connectRelay(relayUrl)` directly and reads
// none of the RELAY_RECONNECT_* knobs.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const srcDir = join(here, "..", "src");
const indexSrc = readFileSync(join(srcDir, "index.ts"), "utf8");

describe("Story 57 wiring — index.ts uses the resilient layer", () => {
  it("connects via connectResilientRelay (not the bare connectRelay)", () => {
    expect(indexSrc).toMatch(/connectResilientRelay\s*\(/);
  });

  it("reads RELAY_RECONNECT_ATTEMPTS", () => {
    expect(indexSrc).toContain("RELAY_RECONNECT_ATTEMPTS");
  });

  it("reads RELAY_RECONNECT_BASE_MS", () => {
    expect(indexSrc).toContain("RELAY_RECONNECT_BASE_MS");
  });

  it("reads RELAY_RECONNECT_MAX_MS", () => {
    expect(indexSrc).toContain("RELAY_RECONNECT_MAX_MS");
  });
});
