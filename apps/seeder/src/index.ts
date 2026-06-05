// Catalog seeder orchestrator (ADR 0008 + 0009): Open Library subjects ->
// librarian-signed kind-39999 BookRecords + a tag taxonomy + baseline genre
// tag-assertions -> dcosl. Idempotent (deterministic d-tags), resumable
// (checkpoint), rate-limited, logs to stdout.
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  toBookRecordEvent,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type BookTagAssertion,
  type DListAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { fetchSubjectSearch, SEEDER_USER_AGENT } from "./search";
import { deriveSlug, mapSearchDocToBookRecord } from "./openlibrary";
import { EDITION_MIN, type OLSearchDoc } from "./gate";
import { dedupBooks, type CollectedBook } from "./dedup";
import { buildConceptHeaderTemplate } from "./headers";
import { STARTER_TAXONOMY } from "./taxonomy";
import { loadCheckpoint } from "./checkpoint";
import { loadDescCache } from "./desc-cache";
import { fingerprint } from "./fingerprint";
import { capBlurb, requestWorkDescription, sanitizeDescription } from "./description";
import { connectResilientRelay } from "./resilient-relay";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

// Our UI genres -> Open Library subject slugs. Genre slugs match STARTER_TAXONOMY.
const SUBJECTS: ReadonlyArray<{ slug: string; ol: string }> = [
  { slug: "literary-fiction", ol: "fiction" },
  { slug: "science-fiction", ol: "science_fiction" },
  { slug: "mystery", ol: "mystery" },
  { slug: "romance", ol: "romance" },
  { slug: "fantasy", ol: "fantasy" },
  { slug: "thriller", ol: "thriller" },
  { slug: "biography", ol: "biography" },
  { slug: "history", ol: "history" },
];

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`seeder: missing required env var ${name}`);
  }
  return v;
}

type Template = { kind: number; created_at: number; tags: string[][]; content: string };

async function main() {
  const relayUrl = env("DCOSL_RELAY_URL", "wss://dcosl.brainstorm.world/");
  const nsec = env("LIBRARIAN_NSEC");
  const perSubjectTarget = Number(env("PER_SUBJECT_TARGET", "1250"));
  const maxPages = Number(env("MAX_PAGES", "60"));
  // The edition floor lives in gate.ts as the single source of truth (ADR §2).
  // The env exists so the floor is visible/auditable in the deployment config;
  // a mismatch is a config error, surfaced loudly rather than silently ignored.
  const editionMin = Number(env("EDITION_MIN", String(EDITION_MIN)));
  if (editionMin !== EDITION_MIN) {
    throw new Error(
      `seeder: EDITION_MIN env (${editionMin}) does not match the gate floor (${EDITION_MIN}); ` +
        `change EDITION_MIN in apps/seeder/src/gate.ts to retune the gate`,
    );
  }
  const rateMs = Number(env("RATE_MS", "250"));
  const checkpointPath = env("CHECKPOINT_PATH", "/data/seed-checkpoint");
  const checkpointEpoch = Number(env("CHECKPOINT_EPOCH", "4"));
  const descCachePath = env("DESC_CACHE_PATH", "/data/desc-cache");
  // Relay resilience (ADR 0056): a transient dcosl drop is ridden through by
  // reconnecting and retrying with bounded exponential backoff; a sustained
  // outage exits after RELAY_RECONNECT_ATTEMPTS so the checkpoint resumes.
  const reconnectAttempts = Number(env("RELAY_RECONNECT_ATTEMPTS", "6"));
  const reconnectBaseMs = Number(env("RELAY_RECONNECT_BASE_MS", "500"));
  const reconnectMaxMs = Number(env("RELAY_RECONNECT_MAX_MS", "8000"));
  const currentYear = new Date().getUTCFullYear();

  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
  const sk = decoded.data as Uint8Array;
  const librarian = asHexPubkey(getPublicKey(sk));
  const booksHeader = buildBookRecordsHeaderAddress(librarian);
  const tagsHeader = buildBookTagsHeaderAddress(librarian);
  const assertionsHeader = buildBookTagAssertionsHeaderAddress(librarian);

  const checkpoint = loadCheckpoint(checkpointPath, checkpointEpoch);
  const descCache = loadDescCache(descCachePath);
  // A retry after a reconnect may re-send an event the relay accepted just
  // before the drop; this is safe (kind-39999 replaces in place by d-tag, and a
  // checkpoint key is recorded only on a confirmed {ok:true}).
  const relay = await connectResilientRelay({
    url: relayUrl,
    attempts: reconnectAttempts,
    baseMs: reconnectBaseMs,
    maxMs: reconnectMaxMs,
    onReconnect: ({ attempt, attempts, delayMs, error }) =>
      console.warn(
        `[seeder] relay reconnect attempt ${attempt}/${attempts} after ${delayMs}ms: ${error.message}`,
      ),
  });
  console.log(
    `[seeder] librarian=${librarian.slice(0, 12)} relay=${relayUrl} ` +
      `per-subject-target=${perSubjectTarget} max-pages=${maxPages} ` +
      `edition-min=${editionMin} epoch=${checkpointEpoch} already-done=${checkpoint.size()}`,
  );

  const publish = async (template: Template, label: string): Promise<boolean> => {
    const signed = finalizeEvent(template, sk) as unknown as SignedNostrEvent;
    const r = await relay.publish(signed);
    if (!r.ok) console.warn(`[seeder] publish failed (${label}): ${r.reason}`);
    return r.ok;
  };

  // 1. Concept headers: catalog + the two classification concepts.
  for (const h of [
    { slug: "books", name: "books", title: "Books" },
    { slug: "book-tags", name: "book-tags", title: "Book tags" },
    { slug: "book-tag-assertions", name: "book-tag-assertions", title: "Book tag assertions" },
    { slug: "book-submissions", name: "book-submissions", title: "Book submissions" },
  ]) {
    await publish(buildConceptHeaderTemplate({ ...h, createdAt: now() }), `header:${h.slug}`);
    await sleep(rateMs);
  }

  // 2. Tag taxonomy elements.
  for (const t of STARTER_TAXONOMY) {
    const key = `tag:${t.type}:${t.slug}`;
    if (checkpoint.has(key)) continue;
    const tmpl = toWireTemplate(
      toBookTagEvent({ ...t, parentHeader: tagsHeader }),
      now(),
    ) as Template;
    if (await publish(tmpl, key)) checkpoint.add(key);
    await sleep(rateMs);
  }

  // 3. Collect books via the search API (gate applied inside the pager), with
  //    the genre bucket(s) each appears under. Dedup composes slug-first then an
  //    ISBN-13 collapse; the first-seen search doc per slug carries the fields
  //    we map. One record per book; a genre assertion per bucket.
  const collected: CollectedBook[] = [];
  const docBySlug = new Map<string, OLSearchDoc>();
  for (const s of SUBJECTS) {
    const docs = await fetchSubjectSearch(s.ol, perSubjectTarget, {
      maxPages,
      currentYear,
      userAgent: SEEDER_USER_AGENT,
    });
    console.log(`[seeder] subject ${s.ol}: ${docs.length} gated docs`);
    for (const doc of docs) {
      if (!doc.key) continue;
      const slug = deriveSlug(doc.key);
      if (!docBySlug.has(slug)) docBySlug.set(slug, doc);
      const isbn13 = mapSearchDocToBookRecord(doc, booksHeader)?.isbn13;
      collected.push({ slug, ...(isbn13 ? { isbn13 } : {}), genre: s.slug });
    }
  }
  const books = dedupBooks(collected);
  console.log(`[seeder] ${books.length} unique books collected`);

  // 4. Publish each book record + its baseline genre assertions.
  let records = 0;
  let assertions = 0;
  let skipped = 0;
  let failed = 0;
  for (const { slug, genres } of books) {
    const doc = docBySlug.get(slug);
    let record = doc ? mapSearchDocToBookRecord(doc, booksHeader) : null;
    if (!record) {
      skipped++;
      continue;
    }

    // Enrich with a back-jacket blurb from the work description. Cache the raw
    // (or a genuine no-description null) so a re-run does not re-hit OL; a
    // network error is not cached (it retries next run). Fail-open: a fetch
    // failure publishes the record without a blurb.
    const workId = record.openLibraryId;
    if (workId) {
      const cached = descCache.get(workId);
      let raw: string | null = null;
      if (cached) {
        raw = cached.raw;
      } else {
        const result = await requestWorkDescription(workId, {
          userAgent: SEEDER_USER_AGENT,
          timeoutMs: 8000,
        });
        if (result.ok) {
          raw = result.raw;
          descCache.set(workId, raw); // cache genuine result (incl. null)
        } else {
          console.warn(`[seeder] description fetch failed (transient): ${slug}`);
          // Transient failure: do not cache, retry next run. Publish without a blurb.
        }
        await sleep(rateMs); // throttle real OL fetches; skip on a cache hit
      }
      if (raw !== null) {
        const blurb = capBlurb(sanitizeDescription(raw));
        if (blurb) record = { ...record, blurb };
      }
    }

    // Gate the book-record publish on the per-record content fingerprint
    // (epoch-namespaced): unchanged content skips, changed content (e.g. a
    // newly populated blurb) re-publishes in place via the deterministic d-tag.
    const bookKey = `book:${slug}:${fingerprint(record)}`;
    if (!checkpoint.has(bookKey)) {
      const tmpl = toWireTemplate(toBookRecordEvent(record), now()) as Template;
      if (await publish(tmpl, slug)) {
        checkpoint.add(bookKey);
        records++;
      } else {
        failed++;
      }
      await sleep(rateMs);
    }

    const bookAddress: DListAddress<39999> = {
      kind: 39999,
      pubkey: librarian,
      dTag: slug,
    };
    for (const genre of genres) {
      const key = `assert:${slug}:${genre}`;
      if (checkpoint.has(key)) continue;
      const assertion: BookTagAssertion = {
        bookSlug: slug,
        bookAddress,
        tagSlug: genre,
        tagType: "genre",
        polarity: 1,
        asserterPubkey: librarian,
        parentHeader: assertionsHeader,
      };
      const tmpl = toWireTemplate(toBookTagAssertionEvent(assertion), now()) as Template;
      if (await publish(tmpl, key)) {
        checkpoint.add(key);
        assertions++;
      } else {
        failed++;
      }
      await sleep(rateMs);
    }

    if ((records + assertions) % 100 === 0 && records + assertions > 0) {
      console.log(`[seeder] progress: ${records} records, ${assertions} genre assertions, ${failed} failed`);
    }
  }

  relay.close();
  console.log(
    `[seeder] done: ${records} records, ${assertions} genre assertions, ${skipped} skipped, ${failed} failed`,
  );
}

main().catch((err) => {
  console.error("[seeder] fatal:", err);
  process.exit(1);
});
