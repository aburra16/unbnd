// Resolve a pubkey's kind-0 metadata (ADR 0012), best-effort. Returns null
// while loading or when the user has no profile; callers fall back to initials.
import { useEffect, useState } from "react";
import { api, type ProfileMeta } from "../lib/api";

export function useProfileMeta(idOrNpub: string | undefined): ProfileMeta | null {
  const [meta, setMeta] = useState<ProfileMeta | null>(null);

  useEffect(() => {
    if (!idOrNpub) {
      setMeta(null);
      return;
    }
    let cancelled = false;
    api.profile
      .get(idOrNpub)
      .then((res) => {
        if (!cancelled) setMeta(res.profile);
      })
      .catch(() => {
        if (!cancelled) setMeta(null);
      });
    return () => {
      cancelled = true;
    };
  }, [idOrNpub]);

  return meta;
}

/** Best display name from metadata, falling back to a session display name. */
export function displayNameOf(
  meta: ProfileMeta | null,
  fallback: string,
): string {
  return meta?.displayName ?? meta?.name ?? fallback;
}
