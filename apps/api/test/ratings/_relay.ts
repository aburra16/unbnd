// An in-memory relay for the rating route suites (Story 99): applies NIP-01
// filters (kinds, authors, ids, since, single-letter tags) the way strfry does,
// holds the catalog book, and lets `publish` append. Lighter than a real relay,
// honest enough that the routes' precise reads mean something.
import { vi } from "vitest";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { NostrFilter } from "../../src/nostr/query";
import { LIBRARIAN } from "./_fixtures";

export function catalogBook(slug = "orbital", title = "Orbital"): SignedNostrEvent {
  return {
    id: `${slug}`.padEnd(64, "0").slice(0, 64),
    pubkey: LIBRARIAN,
    kind: 39999,
    created_at: 1,
    tags: [["d", slug], ["title", title]],
    content: "",
    sig: "f".repeat(128),
  } as SignedNostrEvent;
}

export function matches(e: SignedNostrEvent, f: NostrFilter): boolean {
  if (f.kinds && !f.kinds.includes(e.kind)) return false;
  if (f.authors && !f.authors.includes(e.pubkey)) return false;
  if (f.ids && !f.ids.includes(e.id)) return false;
  if (f.since !== undefined && e.created_at < f.since) return false;
  for (const [key, values] of Object.entries(f)) {
    if (!key.startsWith("#") || !Array.isArray(values)) continue;
    const name = key.slice(1);
    if (!e.tags.some((t) => t[0] === name && values.includes(t[1] as never))) return false;
  }
  return true;
}

export function memoryRelay(initial: SignedNostrEvent[] = []) {
  const events: SignedNostrEvent[] = [catalogBook(), ...initial];
  const query = vi.fn(async (f: NostrFilter) => events.filter((e) => matches(e, f)));
  const publish = vi.fn(async (e: SignedNostrEvent) => {
    events.push(e);
    return { ok: true as const, id: e.id };
  });
  return { events, query, publish };
}
