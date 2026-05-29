// Live-relay round-trip for the publish/read-back core (AC-4 / AC-5).
// Gated on STRFRY_TEST_URL so it skips by default and runs only when a relay
// is reachable (mirrors db/integration.test.ts gating on DATABASE_URL).
//   STRFRY_TEST_URL=ws://localhost:7777 pnpm --filter @unbnd/api test
import { describe, expect, it } from "vitest";
import type { Config } from "../../src/config";
import { publishEvent } from "../../src/nostr/publish";
import { queryEvents } from "../../src/nostr/query";
import { summarizeRatings } from "../../src/ratings/summary";
import { LIBRARIAN, signedRating } from "../ratings/_fixtures";

const STRFRY_TEST_URL = process.env.STRFRY_TEST_URL;

function testConfig(): Config {
  return {
    port: 8787,
    strfryUrl: STRFRY_TEST_URL!,
    neo4jBoltUrl: "bolt://localhost:7687",
    neo4jUser: "neo4j",
    neo4jPassword: "x",
    tapestryApiUrl: "http://localhost:8080",
    searchUrl: "http://localhost:7700",
    searchApiKey: "x",
    searchProvider: "meili",
    databaseUrl: "postgres://x:x@localhost:5432/x",
    backupEncryptionKey: "a".repeat(64),
    publicOrigin: "http://localhost:5181",
    librarianPubkey: LIBRARIAN,
  };
}

describe.skipIf(!STRFRY_TEST_URL)("strfry publish + read-back", () => {
  it("publishes a signed rating and reads it back through the summary", async () => {
    const config = testConfig();
    const slug = `it-${Math.floor(Date.now() / 1000)}`;
    const { event, pubkey } = signedRating({ bookSlug: slug, score: 5 });

    const published = await publishEvent(config.strfryUrl, event as never);
    expect(published.ok).toBe(true);

    const addr = `39999:${LIBRARIAN}:${slug}`;
    const events = await queryEvents(config, {
      kinds: [39999],
      "#a": [addr],
    });
    expect(events.some((e) => e.id === event.id)).toBe(true);

    const summary = summarizeRatings(events as never);
    expect(summary.count).toBeGreaterThanOrEqual(1);
    expect(summary.average).toBeGreaterThanOrEqual(1);
    // Honest read-back: no trust/weight field leaks.
    expect(JSON.stringify(summary)).not.toMatch(/weight|graperank|trust/i);
    // npub, never hex.
    expect(summary.ratings[0]!.npub.startsWith("npub1")).toBe(true);
    expect(pubkey).toMatch(/^[0-9a-f]{64}$/);
  });
});
