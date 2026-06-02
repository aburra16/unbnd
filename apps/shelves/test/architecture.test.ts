// Story 35 / ADR 0036 §7 (AC-8) — the shelves worker is fixture-verifiable with
// no Brainstorm / NIP-85 specifics. It composes over the NEUTRAL trust surface
// (the `TrustProvider.weights` seam), exactly like the API. This guard mirrors
// the ADR 0014 repo-wide guard, scoped to the worker: no Brainstorm HTTP routes,
// no kind-30382, no `brainstorm_login` leak into the worker source.
//
// FAILING until the worker source exists (the compute + cache modules the worker
// is built from). It reads the worker's `src/` files; the assertion is the
// no-leak invariant, not a missing import.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const SRC = resolve(__dirname, "..", "src");
// The Brainstorm/NIP-85 specifics that must never appear in the worker (ADR 0014).
const FORBIDDEN =
  /\/setup\/|\/authChallenge|\/user\/graperank|graperankResult|\b30382\b|brainstorm_login/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [full] : [];
  });
}

describe("apps/shelves trust provider-agnosticism (ADR 0014 / AC-8)", () => {
  it("the worker source carries no Brainstorm/NIP-85 specifics", () => {
    // Fails first because src/ does not exist yet (the worker is unbuilt); once
    // built, this asserts the worker depends only on the neutral trust surface.
    const files = walk(SRC);
    const offenders = files.filter((f) => FORBIDDEN.test(readFileSync(f, "utf8")));
    expect(offenders, `Brainstorm specifics leaked into the shelves worker:\n${offenders.join("\n")}`).toEqual([]);
  });
});
