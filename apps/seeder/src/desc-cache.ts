// Raw Open Library description cache (ADR 0051 §"The description cache"). A
// JSON-lines file on the seeder-data volume, keyed by workId, value
// `{ raw: string | null }` — caching the RAW description (or the negative
// `null` for a genuine no-description) so an interrupted/re-run seed does not
// re-hit /works/{id}.json. Caching the raw (not the capped blurb) lets the
// sanitizer/cap be re-tuned later without re-fetching.
//
// Cache discipline (ADR Decision 5): a genuine no-description is cached as
// `null` (a HIT, not retried); a network error is NEVER cached (no entry, so
// the caller treats the miss as "retry next run").
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export type DescCacheEntry = { raw: string | null };

export type DescCache = {
  /** A HIT returns the entry (raw string or cached `null`); a miss is undefined. */
  get(workId: string): DescCacheEntry | undefined;
  /** Record and persist a fetched raw (or a genuine no-description `null`). */
  set(workId: string, raw: string | null): void;
};

type CacheLine = { id: string; raw: string | null };

/** Load (or create) the description cache at `path` and return a live handle. */
export function loadDescCache(path: string): DescCache {
  const entries = new Map<string, DescCacheEntry>();
  if (existsSync(path)) {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const parsed = JSON.parse(trimmed) as CacheLine;
        if (typeof parsed.id === "string") {
          entries.set(parsed.id, { raw: parsed.raw ?? null });
        }
      } catch {
        // Skip a corrupt line rather than abort the seed.
      }
    }
  } else {
    mkdirSync(dirname(path), { recursive: true });
  }

  return {
    get: (workId) => entries.get(workId),
    set: (workId, raw) => {
      entries.set(workId, { raw });
      const record: CacheLine = { id: workId, raw };
      appendFileSync(path, `${JSON.stringify(record)}\n`);
    },
  };
}
