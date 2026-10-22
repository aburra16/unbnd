// Story 112 review: without a librarian key there is no catalog to search, so
// search reports itself unavailable instead of querying the relay for nothing.
import { describe, expect, it } from "vitest";
import { unavailableSearch } from "../../src/search/unavailable";

describe("unavailableSearch", () => {
  it("health says why, and a search fails so the route answers 503", async () => {
    const p = unavailableSearch("LIBRARIAN_PUBKEY is not set");
    expect(await p.health()).toEqual({ ok: false, provider: "nip50", error: "LIBRARIAN_PUBKEY is not set" });
    await expect(p.search({ q: "dune", limit: 20, offset: 0 })).rejects.toThrow(/LIBRARIAN_PUBKEY/);
  });
});
