// Story 98 / ADR 0088 §3: one default for Brainstorm's API host and trust
// relays, used by every app; no copy of the old host or the empty relay left.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAINSTORM_DEFAULTS } from "../src";

const REPO = join(__dirname, "..", "..", "..");
const read = (p: string) => readFileSync(join(REPO, p), "utf8");

describe("BRAINSTORM_DEFAULTS", () => {
  it("names Brainstorm production's API host and score relays", () => {
    expect(BRAINSTORM_DEFAULTS.apiUrl).toBe("https://api.brainstorm.world");
    expect(BRAINSTORM_DEFAULTS.trustRelays).toEqual([
      "wss://scores.brainstorm.world",
      "wss://nip85.nosfabrica.com",
    ]);
  });
});

describe("one source: the apps import it, nothing restates the old values", () => {
  const consumers = ["apps/api/src/config.ts", "apps/shelves/src/main.ts", "apps/librarian/src/env.ts"];
  const everywhere = [...consumers, "docker-compose.prod.yml", ".env.example"];

  it("each app reads the shared default", () => {
    for (const f of consumers) expect(read(f)).toMatch(/BRAINSTORM_DEFAULTS/);
  });

  it("no file names the retired host or the empty relay", () => {
    for (const f of everywhere) {
      expect(read(f), f).not.toMatch(/brainstormserver\.nosfabrica\.com/);
      expect(read(f), f).not.toMatch(/nip85\.brainstorm\.world/);
    }
  });
});
