// Project a set of claim events into the public claimant list (Story 31 / ADR
// 0032 §2). A claim is a kind-39999 event carrying the claimant pubkey in its `p`
// tag. Re-claims replace under a stable per-(claimant, book) d-tag; the relay may
// still return both the old and new event, so we dedupe by claimant (freshest by
// created_at wins) and sort deterministically (created_at, then npub). Project to
// `{ npub }` only — the hex pubkey never leaves the server.
import { npubEncode } from "nostr-tools/nip19";
import type { SignedNostrEvent } from "@unbnd/schemas";

export type PublicClaimant = { readonly npub: string };

function claimantHexOf(event: SignedNostrEvent): string | null {
  const p = event.tags.find((t) => t[0] === "p");
  if (p && typeof p[1] === "string") return p[1];
  // Fall back to the signer when no `p` tag is present (defensive).
  return typeof event.pubkey === "string" ? event.pubkey : null;
}

export function projectClaimants(events: SignedNostrEvent[]): PublicClaimant[] {
  return projectClaimantHexes(events).map((hex) => ({ npub: npubEncode(hex) }));
}

/**
 * The deduped, deterministically-ordered claimant HEXES (the same dedup +
 * ordering as `projectClaimants`, but keeping hex so the verification count-gate
 * can be computed before the hex is dropped at the npub projection). The hex
 * never leaves the server — callers project to npub for the response.
 */
export function projectClaimantHexes(events: SignedNostrEvent[]): string[] {
  // Freshest event per claimant hex (a replaced claim collapses to one).
  const freshest = new Map<string, SignedNostrEvent>();
  for (const e of events) {
    const hex = claimantHexOf(e);
    if (!hex) continue;
    const prior = freshest.get(hex);
    if (!prior || e.created_at > prior.created_at) freshest.set(hex, e);
  }
  return [...freshest.values()]
    .sort((a, b) => a.created_at - b.created_at || claimantHexOf(a)!.localeCompare(claimantHexOf(b)!))
    .map((e) => claimantHexOf(e)!);
}
