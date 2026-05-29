// Catalog seeder orchestrator (ADR 0008): Open Library subjects -> librarian-
// signed kind-39999 BookRecords (+ kind-39998 headers) -> dcosl. Idempotent
// (d-tag = slug), resumable (checkpoint), rate-limited, logs to stdout.
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { fetchSubjectWorks } from "./fetch";
import { deriveSlug, mapWorkToBookRecord } from "./openlibrary";
import { buildConceptHeaderTemplate } from "./headers";
import { loadCheckpoint } from "./checkpoint";
import { connectRelay } from "./publish";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const now = () => Math.floor(Date.now() / 1000);

// Our UI genres -> Open Library subject slugs.
const SUBJECTS: ReadonlyArray<{ slug: string; ol: string; title: string }> = [
  { slug: "literary-fiction", ol: "fiction", title: "Literary fiction" },
  { slug: "science-fiction", ol: "science_fiction", title: "Science fiction" },
  { slug: "mystery", ol: "mystery", title: "Mystery" },
  { slug: "romance", ol: "romance", title: "Romance" },
  { slug: "fantasy", ol: "fantasy", title: "Fantasy" },
  { slug: "thriller", ol: "thriller", title: "Thriller" },
  { slug: "biography", ol: "biography", title: "Biography" },
  { slug: "history", ol: "history", title: "History" },
];

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`seeder: missing required env var ${name}`);
  }
  return v;
}

async function main() {
  const relayUrl = env("DCOSL_RELAY_URL", "wss://dcosl.brainstorm.world/");
  const nsec = env("LIBRARIAN_NSEC");
  const perSubject = Number(env("PER_SUBJECT", "300"));
  const rateMs = Number(env("RATE_MS", "250"));
  const checkpointPath = env("CHECKPOINT_PATH", "/data/seed-checkpoint");

  const decoded = decode(nsec);
  if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
  const sk = decoded.data as Uint8Array;
  const librarian = asHexPubkey(getPublicKey(sk));
  const booksHeader = buildBookRecordsHeaderAddress(librarian);

  const checkpoint = loadCheckpoint(checkpointPath);
  const relay = await connectRelay(relayUrl);
  console.log(
    `[seeder] librarian=${librarian.slice(0, 12)} relay=${relayUrl} ` +
      `per-subject=${perSubject} already-done=${checkpoint.size()}`,
  );

  const publishTemplate = async (
    template: { kind: number; created_at: number; tags: string[][]; content: string },
    label: string,
  ): Promise<boolean> => {
    const signed = finalizeEvent(template, sk) as unknown as SignedNostrEvent;
    const r = await relay.publish(signed);
    if (!r.ok) console.warn(`[seeder] publish failed (${label}): ${r.reason}`);
    return r.ok;
  };

  // 1. Concept headers: the books header + one per genre.
  await publishTemplate(
    buildConceptHeaderTemplate({ slug: "books", name: "books", title: "Books", createdAt: now() }),
    "header:books",
  );
  for (const s of SUBJECTS) {
    await publishTemplate(
      buildConceptHeaderTemplate({ slug: s.slug, name: s.slug, title: s.title, createdAt: now() }),
      `header:${s.slug}`,
    );
    await sleep(rateMs);
  }

  // 2. Book records per subject.
  let published = 0;
  let skipped = 0;
  let failed = 0;
  const seen = new Set<string>();
  for (const s of SUBJECTS) {
    const works = await fetchSubjectWorks(s.ol, perSubject);
    console.log(`[seeder] subject ${s.ol}: ${works.length} works`);
    for (const work of works) {
      const slug = deriveSlug(work.key);
      if (seen.has(slug) || checkpoint.has(slug)) {
        skipped++;
        continue;
      }
      seen.add(slug);
      const record = mapWorkToBookRecord(work, booksHeader);
      if (!record) {
        skipped++;
        continue;
      }
      const template = toWireTemplate(toBookRecordEvent(record), now());
      const ok = await publishTemplate(
        template as { kind: number; created_at: number; tags: string[][]; content: string },
        slug,
      );
      if (ok) {
        checkpoint.add(slug);
        published++;
      } else {
        failed++;
      }
      if ((published + failed) % 50 === 0 && published + failed > 0) {
        console.log(`[seeder] progress: ${published} published, ${skipped} skipped, ${failed} failed`);
      }
      await sleep(rateMs);
    }
  }

  relay.close();
  console.log(`[seeder] done: ${published} published, ${skipped} skipped, ${failed} failed`);
}

main().catch((err) => {
  console.error("[seeder] fatal:", err);
  process.exit(1);
});
