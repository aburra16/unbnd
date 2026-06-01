// Story 30 / ADR 0031 gate decision 2 — the secret-leak guard. The promotion
// pipeline mints librarian-signed catalog records, but `LIBRARIAN_NSEC` must
// NEVER live on the internet-facing API process. Only the off-path worker
// (`apps/promoter`) may reference it. This scans `apps/api/src` and asserts the
// string `LIBRARIAN_NSEC` appears NOWHERE there.
//
// RED-or-GREEN posture: this is a guard that must hold for the life of the
// feature. It is GREEN today (the API never references the secret) and the
// Implementer must keep it green — Option B (API holds the signer) is rejected,
// so any code that puts `LIBRARIAN_NSEC` under apps/api/src fails this test.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, relative } from "node:path";

const API_SRC = resolve(__dirname, "..", "..", "src");
const SKIP_DIRS = new Set(["node_modules", "dist", ".git"]);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP_DIRS.has(name)) return [];
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("no LIBRARIAN_NSEC on the API (ADR 0031 gate decision 2)", () => {
  it("the string LIBRARIAN_NSEC appears nowhere under apps/api/src", () => {
    const offenders: string[] = [];
    for (const file of walk(API_SRC)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("LIBRARIAN_NSEC")) {
        offenders.push(relative(resolve(API_SRC, ".."), file).replace(/\\/g, "/"));
      }
    }
    expect(
      offenders,
      `LIBRARIAN_NSEC must never be on the internet-facing API; found in:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
