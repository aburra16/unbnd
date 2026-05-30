// Shared npub→hex validator (ADR 0020 Decision 1). Extracted from
// routes/profile.ts so the public-profile by-pubkey twins (routes/shelves.ts,
// routes/profile-stats.ts) and the identity endpoint share one validator. No
// hand-rolled crypto — uses nostr-tools/nip19 `decode`.
import { decode } from "nostr-tools/nip19";

const HEX64 = /^[0-9a-f]{64}$/i;

/** Normalise an npub (bech32) or hex string to a lowercase hex pubkey, or null. */
export function toHex(id: string): string | null {
  if (HEX64.test(id)) return id.toLowerCase();
  try {
    const d = decode(id);
    if (d.type === "npub" && typeof d.data === "string") return d.data;
  } catch {
    // not a valid npub
  }
  return null;
}
