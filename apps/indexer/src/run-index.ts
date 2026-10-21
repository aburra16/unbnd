// The index orchestration seam (Story 56, ADR 0055 §4). Extracted from `main()`
// so the flush-before-upsert ordering is unit-testable against a mock provider
// without executing relay I/O.
//
// A re-index is self-cleaning: configure the index, flush every document, then
// upsert the current filtered set. `deleteAll()` runs AFTER `configureIndex()`
// and BEFORE any upsert, so a junk document indexed before the read-time filter
// cannot survive a rebuild. `deleteAll()` tolerates a 404, so a first-ever run
// (empty/new index) is unaffected.
import { createReadStream, createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { once } from "node:events";
import type { Writable } from "node:stream";
import { finished } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { SearchDocument, SearchProvider } from "@unbnd/search";

const BATCH = 500;


/**
 * Story 108 / ADR 0096 §4: the same clean rebuild without holding the catalog.
 * The walk writes each page's documents to a temporary file; only a complete
 * walk clears the index and loads it from that file, so a relay failure
 * mid-walk leaves the old index as it was.
 */
export async function runIndexInPages(
  provider: SearchProvider,
  eachPage: (onDocs: (docs: readonly SearchDocument[]) => Promise<void>) => Promise<void>,
  opts: { readonly openOut?: (file: string) => Writable } = {},
): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "unbnd-index-"));
  const file = join(dir, "documents.ndjson");
  try {
    const out = (opts.openOut ?? ((f: string) => createWriteStream(f)))(file);
    // A write error (a full disk) must fail the run, not hang it or pass as done.
    let writeError: Error | undefined;
    out.on("error", (err: Error) => { writeError ??= err; });
    let walked = 0;
    try {
      await eachPage(async (docs) => {
        for (const d of docs) {
          if (writeError) throw writeError;
          if (!out.write(`${JSON.stringify(d)}\n`)) {
            await Promise.race([once(out, "drain"), finished(out)]);
          }
        }
        walked += docs.length;
      });
    } finally {
      out.end();
      await finished(out).catch((err: Error) => { writeError ??= err; });
    }
    if (writeError) throw writeError;
    console.log(`[indexer] walked ${walked} documents; loading`);

    await provider.configureIndex();
    await provider.deleteAll();
    let indexed = 0;
    let batch: SearchDocument[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      await provider.index(batch);
      indexed += batch.length;
      batch = [];
      console.log(`[indexer] indexed ${indexed}/${walked}`);
    };
    for await (const line of createInterface({ input: createReadStream(file), crlfDelay: Infinity })) {
      if (!line) continue;
      batch.push(JSON.parse(line) as SearchDocument);
      if (batch.length >= BATCH) await flush();
    }
    await flush();
    return indexed;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
