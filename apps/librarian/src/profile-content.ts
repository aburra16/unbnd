// The librarian's public identity (Story 98 / ADR 0088 §1-2). Reviewed code,
// like the books header: a worker republishes it, so the code owns it. Kept
// from the operator's 2026-05-30 profile: name, display name, picture, NIP-05,
// website. Added: the automated flag and an about line that says so.
import type { NostrEventTemplate } from "@unbnd/schemas";

export const LIBRARIAN_PROFILE: Readonly<Record<string, string | boolean>> = {
  name: "unbnd",
  display_name: "Unbnd Librarian",
  about:
    "Unbnd's house point of view. An automated account that keeps the book catalog, seeded from Open Library.",
  picture:
    "https://blossom.primal.net/53e4b6216c43ab1a3b5eb745cdc84b1c9cff15efd991e51b1554d08a30aa6105.jpg",
  nip05: "librarian@unbnd.ink",
  website: "https://unbnd.ink",
  bot: true,
};

/** Where the librarian publishes: its lists on dcosl, everything else on general relays. Unmarked = read and write. */
export const LIBRARIAN_RELAY_LIST: readonly string[] = [
  "wss://dcosl.brainstorm.world",
  "wss://relay.damus.io",
  "wss://relay.primal.net",
  "wss://nos.lol",
];

export function buildLibrarianKind0Template(
  profile: Readonly<Record<string, unknown>>,
  createdAt: number,
): NostrEventTemplate {
  return { kind: 0, created_at: createdAt, content: JSON.stringify(profile), tags: [] };
}

export function buildLibrarianRelayListTemplate(
  relays: readonly string[],
  createdAt: number,
): NostrEventTemplate {
  return { kind: 10002, created_at: createdAt, content: "", tags: relays.map((r) => ["r", r]) };
}
