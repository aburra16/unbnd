// Failing tests for Story 52 (book blurbs from Open Library), per ADR 0051.
// The raw-description disk cache (ADR §"The description cache"): a JSON-lines
// file keyed by workId whose value caches the RAW OL description (or the
// negative `null` result) so a re-run does not re-hit /works/{id}.json.
//
// Cache rules under test (ADR Decision 5 + the cache section):
//   - a cached raw is returned (so the caller skips the second fetch);
//   - a genuine no-description result is cached as `null` and NOT retried;
//   - a network error is NOT cached (transient miss → next run retries).
//
// The cache surface is `loadDescCache(path)` returning
//   { get(workId): { raw: string | null } | undefined, set(workId, raw|null) }.
// Loaded via an opaque specifier (see _load.ts) so the not-yet-existing module
// is a clean assertion-level red, not a tsc compile wall.
import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadSeederModule } from "./_load";

type DescCache = {
  get(workId: string): { raw: string | null } | undefined;
  set(workId: string, raw: string | null): void;
};
type DescCacheModule = { loadDescCache: (path: string) => DescCache };

const load = () => loadSeederModule<DescCacheModule>("desc-cache");

const dirs: string[] = [];
function tmpFile() {
  const dir = mkdtempSync(join(tmpdir(), "desc-cache-"));
  dirs.push(dir);
  return join(dir, "desc-cache");
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("loadDescCache", () => {
  it("reports a miss for an unknown work id", async () => {
    const { loadDescCache } = await load();
    const cache = loadDescCache(tmpFile());
    expect(cache.get("OL1W")).toBeUndefined();
  });

  it("returns a cached raw description (so the caller can skip a second fetch)", async () => {
    const { loadDescCache } = await load();
    const cache = loadDescCache(tmpFile());
    cache.set("OL1W", "A cached blurb.");
    expect(cache.get("OL1W")).toEqual({ raw: "A cached blurb." });
  });

  it("caches a genuine no-description result as null (a HIT, not a miss)", async () => {
    const { loadDescCache } = await load();
    const cache = loadDescCache(tmpFile());
    cache.set("OL2W", null);
    const hit = cache.get("OL2W");
    expect(hit).toBeDefined();
    expect(hit!.raw).toBeNull();
  });

  it("persists across reload so a re-run does not re-fetch (raw and null both survive)", async () => {
    const { loadDescCache } = await load();
    const path = tmpFile();
    const c1 = loadDescCache(path);
    c1.set("OL-raw", "Persisted blurb.");
    c1.set("OL-null", null);

    const c2 = loadDescCache(path);
    expect(c2.get("OL-raw")).toEqual({ raw: "Persisted blurb." });
    expect(c2.get("OL-null")).toBeDefined();
    expect(c2.get("OL-null")!.raw).toBeNull();
  });

  it("distinguishes a cached null (genuine miss, do not retry) from an absent entry (transient, do retry)", async () => {
    const { loadDescCache } = await load();
    const cache = loadDescCache(tmpFile());
    cache.set("OL-known-empty", null);
    // A network error must NOT be cached — so the work id is simply never set,
    // and the cache reports a miss, which the caller treats as "retry".
    expect(cache.get("OL-known-empty")).toBeDefined(); // genuine → won't retry
    expect(cache.get("OL-transient-error")).toBeUndefined(); // never cached → will retry
  });
});
