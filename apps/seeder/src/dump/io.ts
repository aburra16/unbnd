// Open Library's monthly dumps on disk (Story 109 / ADR 0097): downloaded from
// archive.org, checked against the md5 archive.org lists, and read back a line
// at a time. md5 is the integrity check archive.org publishes, not a security
// use; it goes through node:crypto like every hash here.
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { SEEDER_USER_AGENT } from "../fetch";

export type DumpKind = "works" | "editions" | "authors" | "redirects" | "reading-log";

export const DUMP_KINDS: readonly DumpKind[] = ["works", "editions", "authors", "redirects", "reading-log"];

export function dumpFileName(kind: DumpKind, date: string): string {
  return `ol_dump_${kind}_${date}.txt.gz`;
}

const itemUrl = (date: string) => `https://archive.org/download/ol_dump_${date}`;

/** Each listed file's md5, from archive.org's `<item>_files.xml`. */
export function parseFilesXml(xml: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of xml.matchAll(/<file name="([^"]+)"[^>]*>([\s\S]*?)<\/file>/g)) {
    const md5 = m[2]!.match(/<md5>([0-9a-f]{32})<\/md5>/)?.[1];
    if (md5) out.set(m[1]!, md5);
  }
  return out;
}

export async function fetchManifest(date: string, fetchImpl: typeof fetch = fetch): Promise<Map<string, string>> {
  const res = await fetchImpl(`${itemUrl(date)}/ol_dump_${date}_files.xml`, {
    headers: { "User-Agent": SEEDER_USER_AGENT },
  });
  if (!res.ok) throw new Error(`archive.org files.xml for ${date}: HTTP ${res.status}`);
  return parseFilesXml(await res.text());
}

async function md5Of(path: string): Promise<string> {
  const hash = createHash("md5");
  await pipeline(createReadStream(path), new Transform({
    transform(chunk, _enc, cb) {
      hash.update(chunk);
      cb();
    },
  }));
  return hash.digest("hex");
}

/**
 * The dump file on disk, downloaded and verified if it is not already. A file
 * counts as verified when a `.md5` beside it records the expected md5 (so a
 * 12 GB file is hashed once). A mismatch removes the download and throws.
 */
export async function ensureDump(opts: {
  readonly dir: string;
  readonly kind: DumpKind;
  readonly date: string;
  readonly md5: string;
  readonly fetchImpl?: typeof fetch;
  readonly log?: (message: string) => void;
}): Promise<string> {
  const name = dumpFileName(opts.kind, opts.date);
  const path = join(opts.dir, name);
  const marker = `${path}.md5`;
  const recorded = await readFile(marker, "utf8").catch(() => "");
  const existing = await stat(path).catch(() => null);
  if (existing && recorded.trim() === opts.md5) return path;
  // A file left by an earlier run (or put there by hand) is checked, not fetched again.
  if (existing && (await md5Of(path)) === opts.md5) {
    await writeFile(marker, opts.md5);
    return path;
  }

  await mkdir(opts.dir, { recursive: true });
  const partial = `${path}.part`;
  const res = await (opts.fetchImpl ?? fetch)(`${itemUrl(opts.date)}/${name}`, {
    headers: { "User-Agent": SEEDER_USER_AGENT },
  });
  if (!res.ok || !res.body) throw new Error(`archive.org ${name}: HTTP ${res.status}`);
  opts.log?.(`[import] downloading ${name}`);
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(partial));
  const actual = await md5Of(partial);
  if (actual !== opts.md5) {
    await rm(partial, { force: true });
    throw new Error(`${name}: md5 ${actual} does not match archive.org's ${opts.md5}`);
  }
  await rename(partial, path);
  await writeFile(marker, opts.md5);
  return path;
}

/** Each line of a gzip file, without its newline. */
export async function* gzLines(path: string): AsyncGenerator<string> {
  const lines = createInterface({ input: createReadStream(path).pipe(createGunzip()), crlfDelay: Infinity });
  for await (const line of lines) yield line;
}
