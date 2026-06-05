// FAILING TESTS (red) — Story 60 (index-on-write), ADR 0059 Q5 / §6 + CLAUDE.md
// invariant #3 (index membership is RAW consensus, NEVER trust-weighted; trust
// is a query-time rerank only — ADR 0035). A static guard, mirroring the ADR
// 0013 architecture.test.ts file-scan: the index-on-write modules — the shared
// per-book builder, the shared reindex helper, and the two wiring sites — must
// NOT import the trust-weighted aggregator (`aggregateBookTagsWeighted`) or
// reference a `TrustProvider`. Raw-consensus-at-index-time can never regress into
// trust-weighting.
//
// RED until the Implementer creates the shared modules
// (packages/search/src/build-document.ts + reindex-book.ts). Today those files do
// not exist, so the "the modules exist" assertion fails — a meaningful red ("the
// index-on-write builder/helper aren't implemented yet"). Once they exist, the
// guard additionally pins they stay trust-free.
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const REPO = resolve(__dirname, "..", "..", "..", "..");

// The SHARED modules that build the index-on-write document and do the upsert.
// ADR 0059 Implementation notes §1, §2. These hold the index-on-write LOGIC and
// MUST exist (they are the extraction) and MUST stay trust-free.
//
// NOTE (flag for the Implementer): we deliberately scan ONLY these two shared
// modules — NOT the composition roots (apps/api/src/index.ts,
// apps/promoter/src/main.ts). Those roots legitimately wire a trust provider for
// OTHER concerns (the query-time rerank, ratings/tags reads — ADR 0035), so a
// whole-file scan there is a false positive (e.g. `resolveTrustProvider`). The
// invariant CLAUDE.md #3 pins is that the index-on-write document logic itself is
// raw consensus; that lives entirely in these two files (`buildBookDocument` has
// no trust param by signature, and `reindexBook` only calls the provider + the
// builder). If a future refactor moves index membership into a trust-aware
// module, widen this list to that module.
const SHARED_MODULES = [
  "packages/search/src/build-document.ts", // buildBookDocument (extracted)
  "packages/search/src/reindex-book.ts", // reindexBook helper (best-effort)
];

// Trust-at-index-time tokens that must NOT appear in the index-on-write logic.
const TRUST_TOKENS = /aggregateBookTagsWeighted|TrustProvider/;

describe("index-on-write stays RAW consensus (CLAUDE.md invariant #3, ADR 0059 Q5)", () => {
  it("the shared index-on-write modules exist (extraction landed)", () => {
    const missing = SHARED_MODULES.filter((rel) => !existsSync(join(REPO, rel)));
    expect(
      missing,
      `expected the shared index-on-write modules to exist:\n${missing.join("\n")}`,
    ).toEqual([]);
  });

  it("no shared index-on-write module imports the trust-weighted aggregator or a TrustProvider", () => {
    const offenders: string[] = [];
    for (const rel of SHARED_MODULES) {
      const full = join(REPO, rel);
      if (!existsSync(full)) continue; // existence is pinned by the test above
      const text = readFileSync(full, "utf8");
      if (TRUST_TOKENS.test(text)) {
        offenders.push(`${rel} references trust-weighting at index time`);
      }
    }
    expect(
      offenders,
      `index membership must be RAW consensus, never trust-weighted:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("the extracted builder does NOT reference trust weighting", () => {
    const buildDoc = join(REPO, "packages/search/src/build-document.ts");
    expect(
      existsSync(buildDoc),
      "packages/search/src/build-document.ts must exist (buildBookDocument extraction)",
    ).toBe(true);
    if (existsSync(buildDoc)) {
      expect(TRUST_TOKENS.test(readFileSync(buildDoc, "utf8"))).toBe(false);
    }
  });
});
