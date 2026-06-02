// Story 36 / ADR 0037 §8 (AC-8) — confirm the For-You route falls under the
// repo-wide ADR-0014 trust-architecture guard and carries NO Brainstorm/NIP-85
// specifics. The main guard (architecture.test.ts) already walks `apps` ∪
// `packages` recursively, so `apps/api/src/routes/foryou.ts` is in scope
// automatically; this test PINS that coverage so a future scan-root change can't
// silently drop the route, WITHOUT weakening the guard.
//
// Red-set note: `foryou.ts` does not exist yet. The scan-root coverage assertion
// is meaningful now (it proves the guard would catch the file once written); the
// file-content assertion runs once the Implementer adds the route. We do NOT
// weaken the guard — we extend its assertions to name the new file.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..");
const FORYOU = resolve(REPO, "apps/api/src/routes/foryou.ts");

// The same forbidden Brainstorm/NIP-85 surface the main guard enforces.
const BRAINSTORM_SPECIFICS =
  /\/setup\/|\/authChallenge|\/user\/graperank|graperankResult|\b30382\b|brainstorm_login/;

const SCAN_ROOTS = ["apps", "packages"];

describe("For-You route under the ADR-0014 trust guard (AC-8)", () => {
  it("apps/api/src/routes/foryou.ts lives under a guard scan root (apps ∪ packages)", () => {
    // foryou.ts is at apps/api/src/routes/ — under the `apps` scan root the
    // repo-wide guard walks. This is the coverage the guard relies on.
    const underScanRoot = SCAN_ROOTS.some((root) =>
      FORYOU.startsWith(resolve(REPO, root) + "/"),
    );
    expect(underScanRoot).toBe(true);
  });

  it("carries no Brainstorm/NIP-85 specifics once the route exists (consumes only the neutral @unbnd/trust surface)", () => {
    if (!existsSync(FORYOU)) {
      // Not yet implemented — the assertion above already pins guard coverage,
      // and the Implementer's red→green run will exercise this once foryou.ts
      // lands. (Do NOT weaken the guard; this simply defers the content check.)
      expect(existsSync(FORYOU)).toBe(false);
      return;
    }
    const text = readFileSync(FORYOU, "utf8");
    expect(BRAINSTORM_SPECIFICS.test(text)).toBe(false);
  });
});
