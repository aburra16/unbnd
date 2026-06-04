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
import { fetchSubjectWorks, SEEDER_USER_AGENT } from "./fetch";
import { deriveSlug, mapWorkToBookRecord, type OLWork } from "./openlibrary";
import { buildConceptHeaderTemplate } from "./headers";
import { STARTER_TAXONOMY } from "./taxonomy";
import { loadCheckpoint } from "./checkpoint";
import { loadDescCache } from "./desc-cache";
import { fingerprint } from "./fingerprint";
import { capBlurb, requestWorkDescription, sanitizeDescription } from "./description";
import { connectRelay } from "./publish";

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
  const perSubject = Number(env("PER_SUBJECT", "300"));
  const rateMs = Number(env("RATE_MS", "250"));
  const checkpointPath = env("CHECKPOINT_PATH", "/data/seed-checkpoint");
  const checkpointEpoch = Number(env("CHECKPOINT_EPOCH", "1"));
  const descCachePath = env("DESC_CACHE_PATH", "/data/desc-cache");

  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
  const sk = decoded.data as Uint8Array;
  const librarian = asHexPubkey(getPublicKey(sk));
  const booksHeader = buildBookRecordsHeaderAddress(librarian);
  const tagsHeader = buildBookTagsHeaderAddress(librarian);
  const assertionsHeader = buildBookTagAssertionsHeaderAddress(librarian);

  const checkpoint = loadCheckpoint(checkpointPath, checkpointEpoch);
  const descCache = loadDescCache(descCachePath);
  const relay = await connectRelay(relayUrl);
  console.log(
    `[seeder] librarian=${librarian.slice(0, 12)} relay=${relayUrl} ` +
      `per-subject=${perSubject} epoch=${checkpointEpoch} already-done=${checkpoint.size()}`,
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

  // 3. Collect books with the genre bucket(s) they appear under (one record
  //    per book; a genre assertion per bucket).
  const books = new Map<string, { work: OLWork; genres: Set<string> }>();
  for (const s of SUBJECTS) {
    const works = await fetchSubjectWorks(s.ol, perSubject);
    console.log(`[seeder] subject ${s.ol}: ${works.length} works`);
    for (const work of works) {
      const slug = deriveSlug(work.key);
      const entry = books.get(slug) ?? { work, genres: new Set<string>() };
      entry.genres.add(s.slug);
      books.set(slug, entry);
    }
  }
  console.log(`[seeder] ${books.size} unique books collected`);

  // 4. Publish each book record + its baseline genre assertions.
  let records = 0;
  let assertions = 0;
  let skipped = 0;
  let failed = 0;
  for (const [slug, { work, genres }] of books) {
    let record = mapWorkToBookRecord(work, booksHeader);
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
