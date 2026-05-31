// Resolve a pubkey's kind-0 metadata (ADR 0012), best-effort.
//
// The metadata lives on relays, so fetching it costs a round-trip of a couple
// seconds. Re-fetching on every mount made the nav avatar flash to initials on
// each refresh / navigation. To avoid that we cache the resolved metadata:
//   - in memory (survives SPA navigation), and
//   - in sessionStorage (survives a full page refresh within the tab),
// and read it synchronously on first render so the avatar paints immediately.
// A given id is fetched at most once per page-load session; a refresh hydrates
// from sessionStorage with no flash, then refreshes once in the background so a
// changed profile still heals. Returns null while genuinely uncached/loading.
import { useEffect, useState } from "react";
import { api, type ProfileMeta } from "../lib/api";

const memCache = new Map<string, ProfileMeta | null>();
const fetchedThisSession = new Set<string>();
const storageKey = (id: string) => `unbnd:profile:${id}`;

// undefined = cache miss; null = cached "no profile"; object = cached metadata.
function readCache(id: string): ProfileMeta | null | undefined {
  if (memCache.has(id)) return memCache.get(id);
  try {
    const raw = sessionStorage.getItem(storageKey(id));
    if (raw !== null) {
      const value = JSON.parse(raw) as ProfileMeta | null;
      memCache.set(id, value);
      return value;
    }
  } catch {
    // sessionStorage unavailable or corrupt entry → treat as a miss.
  }
  return undefined;
}

function writeCache(id: string, value: ProfileMeta | null): void {
  memCache.set(id, value);
  try {
    sessionStorage.setItem(storageKey(id), JSON.stringify(value));
  } catch {
    // Quota/availability errors are non-fatal; the in-memory cache still holds.
  }
}

export function useProfileMeta(idOrNpub: string | undefined): ProfileMeta | null {
  const [meta, setMeta] = useState<ProfileMeta | null>(() => {
    if (!idOrNpub) return null;
    const cached = readCache(idOrNpub);
    return cached === undefined ? null : cached;
  });

  useEffect(() => {
    if (!idOrNpub) {
      setMeta(null);
      return;
    }

    // Paint the cached value immediately (no flash on refresh/navigation).
    const cached = readCache(idOrNpub);
    if (cached !== undefined) setMeta(cached);

    // Hit the relays at most once per id per page-load session.
    if (fetchedThisSession.has(idOrNpub)) return;
    fetchedThisSession.add(idOrNpub);

    let cancelled = false;
    api.profile
      .get(idOrNpub)
      .then((res) => {
        if (cancelled) return;
        writeCache(idOrNpub, res.profile);
        setMeta(res.profile);
      })
      .catch(() => {
        if (cancelled) return;
        // Keep any cached value; only show "none" if we had nothing to show.
        if (cached === undefined) setMeta(null);
        // The fetch failed, so allow a later mount to retry.
        fetchedThisSession.delete(idOrNpub);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrNpub]);

  return meta;
}

/**
 * Drop all caches for one id (ADR 0022 AC-9). The Settings save calls this on
 * success so the next mount of `/profile/me` (and the AccountMenu) re-reads the
 * freshly-written kind-0 instead of serving the stale Story-19 cache.
 */
export function invalidateProfileMeta(idOrNpub: string): void {
  memCache.delete(idOrNpub);
  fetchedThisSession.delete(idOrNpub);
  try {
    sessionStorage.removeItem(storageKey(idOrNpub));
  } catch {
    // sessionStorage unavailable — the mem-cache delete is enough.
  }
}

/** Best display name from metadata, falling back to a session display name. */
export function displayNameOf(
  meta: ProfileMeta | null,
  fallback: string,
): string {
  return meta?.displayName ?? meta?.name ?? fallback;
}

/** Test-only: clear the in-memory + session caches between cases. */
export function __resetProfileMetaCache(): void {
  memCache.clear();
  fetchedThisSession.clear();
  try {
    sessionStorage.clear();
  } catch {
    // ignore
  }
}
