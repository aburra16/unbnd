// Story 107: every service that reads trust gets the house observer, the
// Brainstorm endpoints and the fixture setting from .env, written the same way, so the
// API and the shelves worker share one vantage (ADR 0057 §5).
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const compose = readFileSync(join(__dirname, "..", "..", "..", "..", "docker-compose.prod.yml"), "utf8");

/** The `environment` lines of one top-level service. */
function envOf(service: string): string[] {
  const lines = compose.split("\n");
  const start = lines.findIndex((l) => l === `  ${service}:`);
  expect(start, service).toBeGreaterThanOrEqual(0);
  const out: string[] = [];
  for (const line of lines.slice(start + 1)) {
    if (/^  \S/.test(line) || /^\S/.test(line)) break;
    const m = line.match(/^\s+- ([A-Z_]+=.*)$/);
    if (m) out.push(m[1]!);
  }
  return out;
}

const TRUST_KEYS = ["HOUSE_OBSERVER_PUBKEY", "TRUST_PROVIDER", "BRAINSTORM_API_URL", "TRUST_RELAYS", "TRUST_FIXTURE"];

describe("trust settings reach every trust-reading service", () => {
  it("the api and the shelves worker receive the same five lines", () => {
    const pick = (service: string) => envOf(service).filter((l) => TRUST_KEYS.includes(l.split("=")[0]!)).sort();
    expect(pick("shelves")).toHaveLength(5);
    expect(pick("api")).toEqual(pick("shelves"));
  });
});
