// The server-side profile cache (Story 110 / ADR 0098 §4). Profiles change
// rarely and relays are slow and flaky, so the profile route serves what it
// found recently and refreshes in the background. A refresh that finds nothing
// keeps the old profile: a slow relay means a slightly older picture, never a
// missing one.
import type { SignedNostrEvent } from "@unbnd/schemas";
import { parseKind0, type ProfileMeta } from "../nostr/profile";

const FRESH_MS = 10 * 60_000;
const EMPTY_MS = 60_000;
const MAX_ENTRIES = 10_000;

/**
 * `staleAt`: when the entry should be read again. `version`: bumped by `set`,
 * so a read that started before a publish does not overwrite it.
 */
type Entry = { meta: ProfileMeta | null; staleAt: number; version: number };

export type ProfileCache = {
  /** The person's profile: cached, refreshed in the background when old, read when unknown. */
  get(pubkeyHex: string): Promise<ProfileMeta | null>;
  /** Record a profile known to be current (one Unbnd just published). */
  set(pubkeyHex: string, meta: ProfileMeta | null): void;
  size(): number;
};

export function createProfileCache(opts: {
  readonly resolve: (pubkeyHex: string) => Promise<ProfileMeta | null>;
  readonly now?: () => number;
  readonly max?: number;
}): ProfileCache {
  const now = opts.now ?? Date.now;
  const max = opts.max ?? MAX_ENTRIES;
  // A Map keeps insertion order; re-inserting on use makes it least-recently-used first.
  const entries = new Map<string, Entry>();
  const reading = new Map<string, Promise<ProfileMeta | null>>();

  const put = (hex: string, entry: Entry) => {
    entries.delete(hex);
    entries.set(hex, entry);
    while (entries.size > max) entries.delete(entries.keys().next().value!);
  };

  const fresh = (meta: ProfileMeta | null, version: number): Entry => ({
    meta,
    staleAt: now() + (meta ? FRESH_MS : EMPTY_MS),
    version,
  });

  // One read per person at a time. A failed or empty read never replaces a
  // profile we have; it keeps it and tries again in a minute. A failed first
  // read stores nothing.
  const read = (hex: string): Promise<ProfileMeta | null> => {
    const inFlight = reading.get(hex);
    if (inFlight) return inFlight;
    const started = entries.get(hex)?.version ?? 0;
    const settle = (meta: ProfileMeta | null | undefined): ProfileMeta | null => {
      const had = entries.get(hex);
      if ((had?.version ?? 0) !== started) return had?.meta ?? null;
      if (meta) put(hex, fresh(meta, started));
      else if (had?.meta) put(hex, { ...had, staleAt: now() + EMPTY_MS });
      else if (meta === null) put(hex, fresh(null, started));
      return meta ?? had?.meta ?? null;
    };
    const p = opts
      .resolve(hex)
      .then(settle, () => settle(undefined))
      .finally(() => reading.delete(hex));
    reading.set(hex, p);
    return p;
  };

  return {
    async get(hex) {
      const entry = entries.get(hex);
      if (!entry) return read(hex);
      put(hex, entry);
      if (now() >= entry.staleAt) {
        if (!entry.meta) return read(hex);
        void read(hex);
      }
      return entry.meta;
    },
    set(hex, meta) {
      put(hex, fresh(meta, (entries.get(hex)?.version ?? 0) + 1));
    },
    size: () => entries.size,
  };
}

type PublishResult = { ok: true; id: string } | { ok: false; reason: string };

/** Wrap a kind-0 publish so a profile Unbnd writes is cached as written (ADR 0098 §4). */
export function cacheOnPublish<R extends PublishResult>(
  publish: (event: SignedNostrEvent) => Promise<R>,
  cache: ProfileCache,
): (event: SignedNostrEvent) => Promise<R> {
  return async (event) => {
    const result = await publish(event);
    if (result.ok && event.kind === 0) cache.set(event.pubkey, parseKind0([event]));
    return result;
  };
}
