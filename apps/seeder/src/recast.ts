// One-time genre recast (Story 75 / ADR 0073). Re-derives every existing catalog
// book's genres from its PRESERVED Open Library subjects — NO external fetch — and
// publishes the librarian genre assertions for the expanded 16-genre taxonomy.
//
// Idempotent + non-destructive by construction: each librarian assertion has the
// d-tag `tagassert--<book>--<genre>--<asserter8>`, so re-running REPLACES the
// librarian's own assertion (no duplicate) and never touches curator/user
// assertions (different asserter8). Run as a deploy/ops step: `pnpm seed:recast`.
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagsHeaderAddress,
  formatAddress,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { connectResilientRelay } from "@unbnd/relay";
import { STARTER_TAXONOMY } from "./taxonomy";
import { loadCheckpoint } from "./checkpoint";
import { buildRecastAssertions } from "./genres";

type Template = { kind: number; created_at: number; tags: string[][]; content: string };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing env ${name}`);
  }
  return v;
}

/** Subjects are serialized as `["subject", <value>]` tags on the book record. */
function subjectsOf(event: SignedNostrEvent): string[] {
  return event.tags.filter((t) => t[0] === "subject" && typeof t[1] === "string").map((t) => t[1]!);
}
function dTagOf(event: SignedNostrEvent): string | null {
  return event.tags.find((t) => t[0] === "d")?.[1] ?? null;
}

async function main(): Promise<void> {
  const nsec = env("LIBRARIAN_NSEC");
  const relayUrl = env("STRFRY_URL", "ws://localhost:7777");
  const checkpointPath = env("RECAST_CHECKPOINT", ".recast-checkpoint");
  const checkpointEpoch = env("RECAST_EPOCH", "1");
  const pageSize = Number(env("RECAST_PAGE_SIZE", "500"));
  const queryTimeoutMs = Number(env("RECAST_QUERY_TIMEOUT_MS", "8000"));
  const rateMs = Number(env("RECAST_RATE_MS", "20"));

  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
  const sk = decoded.data as Uint8Array;
  const librarian = asHexPubkey(getPublicKey(sk));
  const booksZ = formatAddress(buildBookRecordsHeaderAddress(librarian));
  const tagsHeader = buildBookTagsHeaderAddress(librarian);

  const checkpoint = loadCheckpoint(checkpointPath, Number(checkpointEpoch));
  const relay = await connectResilientRelay({ url: relayUrl });
  const publish = async (template: Template, label: string): Promise<boolean> => {
    const signed = finalizeEvent(template, sk) as unknown as SignedNostrEvent;
    const r = await relay.publish(signed);
    if (!r.ok) console.warn(`[recast] publish failed (${label}): ${r.reason}`);
    return r.ok;
  };

  console.log(`[recast] librarian=${librarian.slice(0, 12)} relay=${relayUrl}`);

  // 1. (Re)publish the genre taxonomy elements so /api/tags lists all 16
  //    (idempotent — replaces by d-tag; the book-tags header already exists from
  //    the original seed).
  for (const t of STARTER_TAXONOMY.filter((e) => e.type === "genre")) {
    await publish(
      toWireTemplate(toBookTagEvent({ ...t, parentHeader: tagsHeader }), now()) as Template,
      `genre:${t.slug}`,
    );
    await sleep(rateMs);
  }

  // 2. Page the books concept by a created_at cursor (relay-cap discipline);
  //    derive genres from each record's preserved subjects; publish assertions.
  const yields = new Map<string, number>();
  let until = now() + 1;
  let booksSeen = 0;
  let assertions = 0;
  const seen = new Set<string>();
  for (;;) {
    const events = await relay.query(
      { kinds: [39999], "#z": [booksZ], until, limit: pageSize },
      queryTimeoutMs,
    );
    if (events.length === 0) break;
    let oldest = until;
    for (const ev of events) {
      oldest = Math.min(oldest, ev.created_at);
      const slug = dTagOf(ev);
      if (!slug || seen.has(slug)) continue;
      seen.add(slug);
      booksSeen++;
      for (const a of buildRecastAssertions({ slug, subjects: subjectsOf(ev) }, librarian)) {
        const key = `assert:${a.bookSlug}:${a.tagSlug}`;
        if (checkpoint.has(key)) continue;
        if (await publish(toWireTemplate(toBookTagAssertionEvent(a), now()) as Template, key)) {
          checkpoint.add(key);
          assertions++;
          yields.set(a.tagSlug, (yields.get(a.tagSlug) ?? 0) + 1);
        }
        await sleep(rateMs);
      }
    }
    if (oldest >= until) break; // no progress (all same timestamp) → stop
    until = oldest;
  }

  // 3. Per-genre yield report. A genre that derived ZERO books across the catalog
  //    should be dropped from the taxonomy before launch (AC-6) — flagged here.
  console.log(`[recast] books=${booksSeen} assertions=${assertions}`);
  for (const t of STARTER_TAXONOMY.filter((e) => e.type === "genre")) {
    const n = yields.get(t.slug) ?? 0;
    console.log(`[recast] genre ${t.slug}: ${n}${n === 0 ? "  <-- EMPTY: drop from taxonomy" : ""}`);
  }
  relay.close();
}

main().catch((err) => {
  console.error("[recast] fatal:", err);
  process.exit(1);
});
