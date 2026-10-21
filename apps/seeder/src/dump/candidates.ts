// The five Open Library dumps into candidate books (Story 109 / ADR 0097 §1–§3).
// Passes, in order: redirects, the reading log (readers per work, through one
// redirect hop), editions of candidates, works of candidates (for their first
// author), those authors, then the works again to hand each candidate on. Only
// candidates' lines are parsed as JSON, and works are keyed by their numeric id,
// so memory follows the candidate count, not the dump.
import type { AuthorEvidence } from "../ol-evidence";
import type { Candidate } from "./plan";
import {
  EditionAggregate,
  editionWorkId,
  parseAuthor,
  parseEdition,
  parseRedirect,
  parseWork,
  readingLogWorkId,
  splitDumpLine,
  toSearchDoc,
} from "./extract";
import { gzLines } from "./io";

export type DumpFiles = {
  readonly works: string;
  readonly editions: string;
  readonly authors: string;
  readonly redirects: string;
  readonly readingLog: string;
};

export type ExtractStats = {
  workRedirects: number;
  authorRedirects: number;
  worksWithReaders: number;
  candidates: number;
  editionsParsed: number;
  authors: number;
  handedOn: number;
};

/** `OL123W` or `OL45A` to 123 or 45. */
const num = (id: string) => Number(id.slice(2, -1));

export async function extractCandidates(
  files: DumpFiles,
  opts: {
    readonly readersMin: number;
    /**
     * Each candidate, with every candidate's author already read (for the year
     * rule) and the works Open Library merged into it.
     */
    readonly onCandidate: (
      candidate: Candidate,
      authors: ReadonlyMap<string, AuthorEvidence>,
      mergedFrom: readonly string[],
    ) => void | Promise<void>;
    readonly log?: (message: string) => void;
  },
): Promise<{ authors: Map<string, AuthorEvidence>; stats: ExtractStats }> {
  const log = opts.log ?? (() => {});
  const stats: ExtractStats = {
    workRedirects: 0, authorRedirects: 0, worksWithReaders: 0, candidates: 0, editionsParsed: 0, authors: 0, handedOn: 0,
  };

  // 1. Redirects (merged works and authors).
  const workTo = new Map<number, number>();
  const authorTo = new Map<number, number>();
  for await (const line of gzLines(files.redirects)) {
    const parts = splitDumpLine(line);
    if (!parts || !(parts.key.startsWith("/works/") || parts.key.startsWith("/authors/"))) continue;
    let r;
    try {
      r = parseRedirect(JSON.parse(parts.json) as { key?: unknown; location?: unknown });
    } catch {
      continue;
    }
    if (!r) continue;
    if (r.from.endsWith("W")) workTo.set(num(r.from), num(r.to));
    else authorTo.set(num(r.from), num(r.to));
  }
  stats.workRedirects = workTo.size;
  stats.authorRedirects = authorTo.size;
  const work = (n: number) => workTo.get(n) ?? n;
  log(`[import] redirects: ${stats.workRedirects} works, ${stats.authorRedirects} authors`);

  // 2. Readers per work, then the candidates.
  const readers = new Map<number, number>();
  for await (const line of gzLines(files.readingLog)) {
    const id = readingLogWorkId(line);
    if (!id) continue;
    const w = work(num(id));
    readers.set(w, (readers.get(w) ?? 0) + 1);
  }
  stats.worksWithReaders = readers.size;
  const candidates = new Set<number>();
  for (const [w, n] of readers) if (n >= opts.readersMin) candidates.add(w);
  for (const w of [...readers.keys()]) if (!candidates.has(w)) readers.delete(w);
  stats.candidates = candidates.size;
  const mergedInto = new Map<number, string[]>();
  for (const [from, to] of workTo) {
    if (candidates.has(to)) mergedInto.set(to, [...(mergedInto.get(to) ?? []), `OL${from}W`]);
  }
  log(`[import] ${stats.worksWithReaders} works with readers, ${stats.candidates} with at least ${opts.readersMin}`);

  // 3. Editions of candidates.
  const editions = new Map<number, EditionAggregate>();
  for await (const line of gzLines(files.editions)) {
    const id = editionWorkId(line);
    if (!id) continue;
    const w = work(num(id));
    if (!candidates.has(w)) continue;
    const parts = splitDumpLine(line);
    if (!parts || parts.type !== "/type/edition") continue;
    let fields;
    try {
      fields = parseEdition(JSON.parse(parts.json) as Record<string, unknown>);
    } catch {
      continue;
    }
    let agg = editions.get(w);
    if (!agg) editions.set(w, (agg = new EditionAggregate()));
    agg.add(fields);
    stats.editionsParsed++;
  }
  log(`[import] ${stats.editionsParsed} editions of candidates`);

  // 4. Candidates' first authors, then those authors (through one redirect).
  const authorOf = new Map<number, string>();
  for await (const { w, json } of candidateWorks(files.works, candidates)) {
    const key = parseWork(json).authorKey;
    if (key) authorOf.set(w, key);
  }
  const wanted = new Map<number, string[]>(); // resolved author id -> the keys works name
  for (const key of new Set(authorOf.values())) {
    const resolved = authorTo.get(num(key)) ?? num(key);
    wanted.set(resolved, [...(wanted.get(resolved) ?? []), key]);
  }
  const authors = new Map<string, AuthorEvidence>();
  for await (const line of gzLines(files.authors)) {
    const parts = splitDumpLine(line);
    if (!parts || parts.type !== "/type/author") continue;
    const m = parts.key.match(/^\/authors\/OL(\d+)A$/);
    if (!m) continue;
    const keys = wanted.get(Number(m[1]));
    if (!keys) continue;
    let fields;
    try {
      fields = parseAuthor(JSON.parse(parts.json) as Record<string, unknown>);
    } catch {
      continue;
    }
    for (const k of keys) authors.set(k, fields);
  }
  stats.authors = authors.size;
  log(`[import] ${stats.authors} authors`);

  // 5. Each candidate, handed on.
  for await (const { w, id, json } of candidateWorks(files.works, candidates)) {
    const fields = parseWork(json);
    const agg = editions.get(w) ?? new EditionAggregate();
    const authorName = fields.authorKey ? authors.get(fields.authorKey)?.name : undefined;
    await opts.onCandidate({
      doc: toSearchDoc(id, fields, agg, authorName),
      readers: readers.get(w) ?? 0,
      ...(fields.description ? { description: fields.description } : {}),
    }, authors, mergedInto.get(w) ?? []);
    stats.handedOn++;
  }
  return { authors, stats };
}

/** The works dump's lines for candidate works, parsed. */
async function* candidateWorks(
  path: string,
  candidates: ReadonlySet<number>,
): AsyncGenerator<{ w: number; id: string; json: Record<string, unknown> }> {
  for await (const line of gzLines(path)) {
    const parts = splitDumpLine(line);
    if (!parts || parts.type !== "/type/work") continue;
    const m = parts.key.match(/^\/works\/(OL(\d+)W)$/);
    if (!m || !candidates.has(Number(m[2]))) continue;
    try {
      yield { w: Number(m[2]), id: m[1]!, json: JSON.parse(parts.json) as Record<string, unknown> };
    } catch {
      continue;
    }
  }
}
