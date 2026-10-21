// The Open Library dump import (Story 109 / ADR 0097). Two steps:
//
//   node import.js --dump YYYY-MM-DD           dry run: download and verify the
//     dumps, read the librarian's records from the hub, extract and plan every
//     candidate, write the plan and a report. Publishes nothing.
//   node import.js --dump YYYY-MM-DD --apply   publish that plan, re-checking
//     each book against the hub first, paced and resumable.
//
// `LIBRARIAN_NSEC` is decoded here at runtime and lives only in this worker.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { finalizeEvent, getPublicKey } from "nostr-tools/pure";
import { decode } from "nostr-tools/nip19";
import { connectResilientRelay, forEachPage } from "@unbnd/relay";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  formatAddress,
  fromBookRecordEvent,
  fromWireEvent,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { loadCheckpoint } from "./checkpoint";
import type { FingerprintInput } from "./fingerprint";
import { applyPlan, type PlannedBook } from "./dump/apply";
import { extractCandidates } from "./dump/candidates";
import { DUMP_KINDS, dumpFileName, ensureDump, fetchManifest, type DumpKind } from "./dump/io";
import { liveSummary, planBook, READERS_MIN, type LiveSummary } from "./dump/plan";
import { ImportReport } from "./dump/report";

function env(name: string, fallback?: string): string {
  const v = process.env[name];
  if (v === undefined || v === "") {
    if (fallback !== undefined) return fallback;
    throw new Error(`import: missing required env var ${name}`);
  }
  return v;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const date = args[args.indexOf("--dump") + 1] ?? "";
  if (args.indexOf("--dump") === -1 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("import: --dump YYYY-MM-DD is required");
  }
  const apply = args.includes("--apply");
  const dataDir = env("IMPORT_DATA_DIR", "/data");
  const dumpDir = join(dataDir, "ol-dumps", date);
  const planPath = join(dataDir, `import-plan-${date}.ndjson`);
  const reportPath = join(dataDir, `import-report-${date}.json`);
  const relayUrl = env("DCOSL_RELAY_URL", "wss://dcosl.brainstorm.world/");

  // The dry run reads and publishes nothing, so it needs only the librarian's
  // public key; --apply signs, so it alone needs LIBRARIAN_NSEC.
  let sk: Uint8Array | undefined;
  if (apply || (process.env.LIBRARIAN_NSEC && !process.env.LIBRARIAN_PUBKEY)) {
    const decoded = decode(env("LIBRARIAN_NSEC"));
    if (decoded.type !== "nsec") throw new Error("LIBRARIAN_NSEC is not an nsec");
    sk = decoded.data as Uint8Array;
  }
  const librarian = asHexPubkey(sk ? getPublicKey(sk) : env("LIBRARIAN_PUBKEY"));
  // The plan was made for LIBRARIAN_PUBKEY; publishing it under another key would fork the catalog.
  if (sk && process.env.LIBRARIAN_PUBKEY && asHexPubkey(process.env.LIBRARIAN_PUBKEY) !== librarian) {
    throw new Error("import: LIBRARIAN_NSEC does not belong to LIBRARIAN_PUBKEY");
  }
  const header = buildBookRecordsHeaderAddress(librarian);
  const booksZ = formatAddress(header);
  const assertZ = formatAddress(buildBookTagAssertionsHeaderAddress(librarian));

  const hub = await connectResilientRelay({
    url: relayUrl,
    onReconnect: ({ attempt, attempts, delayMs }) =>
      console.warn(`[import] hub connection lost; reconnecting (${attempt}/${attempts}) in ${delayMs} ms`),
  });

  try {
    if (!apply) {
      // 1. The dumps, verified against archive.org's md5.
      const manifest = await fetchManifest(date);
      const files = {} as Record<DumpKind, string>;
      for (const kind of DUMP_KINDS) {
        const md5 = manifest.get(dumpFileName(kind, date));
        if (!md5) throw new Error(`import: archive.org lists no ${dumpFileName(kind, date)}`);
        files[kind] = await ensureDump({ dir: dumpDir, kind, date, md5, log: console.log });
      }

      // 2. The librarian's records on the hub, as the import sees them.
      const live = new Map<string, LiveSummary>();
      const before = new Map<string, FingerprintInput>();
      const newestAt = new Map<string, number>();
      const walk = await forEachPage(
        (cursor) => hub.query({ kinds: [39999], authors: [librarian], "#z": [booksZ], ...cursor }),
        async (events) => {
          for (const e of events) {
            const slug = e.tags.find((t) => t[0] === "d")?.[1];
            if (!slug || (newestAt.get(slug) ?? -1) >= e.created_at) continue;
            newestAt.set(slug, e.created_at);
            live.set(slug, liveSummary(e));
            try {
              before.set(slug, fromBookRecordEvent(fromWireEvent(e) as never));
            } catch {
              before.delete(slug);
            }
          }
        },
        { pageSize: 500, maxPages: Infinity, totalBudgetMs: Infinity },
      );
      // A cut-short read would plan existing books as new: refuse it.
      if (walk.stuck || walk.capped) throw new Error("import: the hub read did not reach every record; not planning from it");
      console.log(`[import] ${live.size} records on the hub`);

      // 3. Extract and plan every candidate; keep the plan for --apply.
      const report = new ImportReport(date);
      const currentYear = new Date().getUTCFullYear();
      await mkdir(dataDir, { recursive: true });
      const plan = createWriteStream(planPath);
      const { stats } = await extractCandidates(
        { works: files.works, editions: files.editions, authors: files.authors, redirects: files.redirects, readingLog: files["reading-log"] },
        {
          readersMin: READERS_MIN,
          log: console.log,
          onCandidate: async (candidate, authors, mergedFrom) => {
            const slug = `ol-${candidate.doc.key!.replace("/works/", "").toLowerCase()}`;
            const mergedFromCatalog = mergedFrom.some((id) => live.has(`ol-${id.toLowerCase()}`));
            const p = planBook(candidate, live.get(slug), authors, header, currentYear, { mergedFromCatalog });
            report.add(p, before.get(slug));
            if (p.kind === "new" || p.kind === "changed") {
              const line: PlannedBook = { slug, kind: p.kind, record: p.record, genres: p.genres };
              if (!plan.write(`${JSON.stringify(line)}\n`)) await new Promise<void>((r) => plan.once("drain", () => r()));
            }
          },
        },
      );
      await new Promise<void>((resolve, reject) => plan.end((err?: Error | null) => (err ? reject(err) : resolve())));
      const out = { ...report.toJSON(), extract: stats };
      await writeFile(reportPath, JSON.stringify(out, null, 2));
      console.log(JSON.stringify({ counts: out.counts, dropped: out.dropped, yearCorrections: out.yearCorrections, changedFields: out.changedFields }));
      console.log(`[import] dry run done: plan ${planPath}, report ${reportPath}. Nothing was published.`);
      return;
    }

    // --apply: publish the dry run's plan.
    const lines = createInterface({ input: createReadStream(planPath), crlfDelay: Infinity });
    async function* planned(): AsyncGenerator<PlannedBook> {
      for await (const line of lines) if (line) yield JSON.parse(line) as PlannedBook;
    }
    const summary = await applyPlan(planned(), {
      librarian,
      dumpDate: date,
      readCurrent: (slug) => hub.query({ kinds: [39999], authors: [librarian], "#z": [booksZ], "#d": [slug] }),
      readAssertions: (slug) => hub.query({ kinds: [39999], "#z": [assertZ], "#a": [`39999:${librarian}:${slug}`] }),
      sign: (template: NostrEventTemplate) => finalizeEvent(template as never, sk!) as unknown as SignedNostrEvent,
      publish: (event) => hub.publish(event),
      checkpoint: loadCheckpoint(env("IMPORT_CHECKPOINT", join(dataDir, "import-checkpoint"))),
      now: () => Math.floor(Date.now() / 1000),
      sleep,
      ratePerSecond: Number(env("IMPORT_RATE", "10")),
      log: console.log,
    });
    console.log(`[import] applied ${date}: ${JSON.stringify(summary)}`);
    // Failed books are retried by the next run; a non-zero exit makes them visible.
    if (summary.failed > 0) process.exitCode = 1;
  } finally {
    hub.close();
  }
}

main().catch((err) => {
  console.error("[import] fatal:", err);
  process.exit(1);
});
