// Correcting catalog years at source (Story 104 / ADR 0092 §4–5). Pure planning
// over the librarian's live records plus a runner with injected I/O; the
// `years.js` entrypoint (correct-years.ts) wires the hub, Open Library and the
// librarian key, and the seed (index.ts) shares judgeRecordYear/withJudgedYear
// so a later epoch writes the same year.
import { isDeepStrictEqual } from "node:util";
import {
  fromBookRecordEvent,
  fromWireEvent,
  isDelistedRecord,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type BookRecordPayload,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { AuthorEvidence, WorkEvidence } from "./ol-evidence";
import { authorBirthFor, judgeYear, type YearVerdict } from "./year";

export type YearNote = {
  readonly slug: string;
  readonly title: string;
  readonly authorName: string;
  readonly year: number;
};

export type YearCorrection = YearNote & {
  readonly to: number;
  /** The live event being replaced. */
  readonly event: SignedNostrEvent;
};

export type YearPlan = {
  readonly corrections: readonly YearCorrection[];
  readonly kept: readonly YearNote[];
  readonly unresolved: readonly YearNote[];
  readonly noEvidence: readonly YearNote[];
  /** Corrections whose record does not rebuild to the same event: never published. */
  readonly refused: readonly YearNote[];
};

/** Judge a record's year, or none when it has no year or the work has no evidence. */
export function judgeRecordYear(
  record: BookRecord,
  work: WorkEvidence | undefined,
  authors: ReadonlyMap<string, AuthorEvidence>,
  currentYear: number,
): YearVerdict | undefined {
  if (record.publishYear === undefined || !work) return undefined;
  const author = work.authorKey ? authors.get(work.authorKey) : undefined;
  return judgeYear(
    {
      year: record.publishYear,
      editionYears: work.editionYears,
      authorBirthYear: authorBirthFor(record.authorName, author),
    },
    currentYear,
  );
}

/** The record with a corrected year; any other verdict leaves it as it is. */
export function withJudgedYear(record: BookRecord, verdict: YearVerdict | undefined): BookRecord {
  return verdict?.kind === "corrected" ? { ...record, publishYear: verdict.year } : record;
}

type Candidate = { readonly event: SignedNostrEvent; readonly record: BookRecord & { publishYear: number } };

/**
 * The librarian's live Open Library records with a year, newest event per slug.
 * Only the librarian's own events: the correction re-signs their content with
 * the librarian key. Community records keep their submitter's year; delisted
 * and unreadable events are not book records.
 */
function candidates(events: readonly SignedNostrEvent[], librarian: string): Candidate[] {
  const newest = new Map<string, SignedNostrEvent>();
  for (const e of events) {
    if (e.kind !== 39999 || e.pubkey !== librarian) continue;
    const slug = e.tags.find((t) => t[0] === "d")?.[1];
    if (!slug) continue;
    const seen = newest.get(slug);
    if (!seen || e.created_at > seen.created_at) newest.set(slug, e);
  }
  const out: Candidate[] = [];
  for (const event of newest.values()) {
    if (isDelistedRecord(event)) continue;
    const record = readRecord(event);
    if (!record || record.source !== "openlibrary" || !record.openLibraryId) continue;
    if (record.publishYear === undefined) continue;
    out.push({ event, record: record as Candidate["record"] });
  }
  return out;
}

function readRecord(event: SignedNostrEvent): BookRecord | null {
  try {
    return fromBookRecordEvent(fromWireEvent(event) as never);
  } catch {
    return null;
  }
}

const note = ({ record }: Candidate): YearNote => ({
  slug: record.slug,
  title: record.title,
  authorName: record.authorName,
  year: record.publishYear,
});

const byYearThenTitle = (a: YearNote, b: YearNote) => a.year - b.year || a.title.localeCompare(b.title);

const payloadOf = (event: { readonly tags: readonly string[][] }): unknown => {
  const json = event.tags.find((t) => t[0] === "json")?.[1];
  return json === undefined ? undefined : JSON.parse(json);
};

/**
 * The librarian's record with only its year changed (ADR 0092 §4): rebuilt
 * through the schema, then checked to differ from the live event in nothing
 * but the `year` tag and the payload's `publishYear`. The one allowed payload
 * difference is the explicit `submittedBy: null` old records lack. Throws when
 * the record does not rebuild to the same event.
 */
export function correctedRecordTemplate(
  event: SignedNostrEvent,
  year: number,
  createdAt: number,
): NostrEventTemplate {
  const original = fromBookRecordEvent(fromWireEvent(event) as never);
  const expected = { ...original, publishYear: year };
  const template = toWireTemplate(toBookRecordEvent(expected), createdAt);

  const named = (tags: readonly string[][]) => tags.filter((t) => t[0] !== "json");
  const expectedTags = named(event.tags).map((t) => (t[0] === "year" ? ["year", String(year)] : t));
  const before = payloadOf(event) as BookRecordPayload;
  const expectedPayload = {
    ...before,
    bookSubmission: { submittedBy: null, ...before.bookSubmission, publishYear: year },
  };
  if (
    !isDeepStrictEqual(named(template.tags), expectedTags) ||
    template.content !== event.content ||
    !isDeepStrictEqual(payloadOf(template), expectedPayload)
  ) {
    throw new Error(`record ${original.slug} does not rebuild to the same event`);
  }
  return template;
}

/** Plan every year correction over the librarian's records (ADR 0092 §1, §4). */
export function planYearCorrections(
  events: readonly SignedNostrEvent[],
  librarian: string,
  works: ReadonlyMap<string, WorkEvidence>,
  authors: ReadonlyMap<string, AuthorEvidence>,
  currentYear: number,
): YearPlan {
  const corrections: YearCorrection[] = [];
  const kept: YearNote[] = [];
  const unresolved: YearNote[] = [];
  const noEvidence: YearNote[] = [];
  const refused: YearNote[] = [];

  for (const c of candidates(events, librarian)) {
    const verdict = judgeRecordYear(c.record, works.get(c.record.openLibraryId!), authors, currentYear);
    if (!verdict) noEvidence.push(note(c));
    else if (verdict.kind === "kept") kept.push(note(c));
    else if (verdict.kind === "unresolved") unresolved.push(note(c));
    else if (verdict.kind === "corrected") {
      try {
        correctedRecordTemplate(c.event, verdict.year, c.event.created_at);
        corrections.push({ ...note(c), to: verdict.year, event: c.event });
      } catch {
        refused.push(note(c));
      }
    }
  }

  return {
    corrections: corrections.sort(byYearThenTitle),
    kept: kept.sort(byYearThenTitle),
    unresolved: unresolved.sort(byYearThenTitle),
    noEvidence: noEvidence.sort(byYearThenTitle),
    refused: refused.sort(byYearThenTitle),
  };
}

const field = (s: string) => s.replace(/\s+/g, " ").trim();
const line = (kind: string, n: YearNote, to = "") =>
  [kind, n.slug, String(n.year), to, field(n.title), field(n.authorName)].join("\t");

/**
 * The dry-run list, tab-separated: `correct  slug  stored  new  title  author`,
 * then the kept, unresolved, no-evidence and refused records (no new year),
 * then a counts line.
 */
export function formatPlan(plan: YearPlan): string[] {
  return [
    ...plan.corrections.map((c) => line("correct", c, String(c.to))),
    ...plan.kept.map((n) => line("keep", n)),
    ...plan.unresolved.map((n) => line("unresolved", n)),
    ...plan.noEvidence.map((n) => line("no-evidence", n)),
    ...plan.refused.map((n) => line("refused", n)),
    `# corrections=${plan.corrections.length} kept=${plan.kept.length} ` +
      `unresolved=${plan.unresolved.length} no-evidence=${plan.noEvidence.length} ` +
      `refused=${plan.refused.length}`,
  ];
}

export type PublishResult = { readonly ok: boolean; readonly reason?: string };

export type YearRunDeps = {
  readonly events: readonly SignedNostrEvent[];
  readonly librarian: string;
  readonly fetchWorks: (workIds: readonly string[]) => Promise<Map<string, WorkEvidence>>;
  readonly fetchAuthors: (authorKeys: readonly string[]) => Promise<Map<string, AuthorEvidence>>;
  readonly currentYear: number;
  readonly now: () => number;
  readonly log: (line: string) => void;
  /** Absent = dry run: plan and log, publish nothing. */
  readonly publish?: (template: NostrEventTemplate) => Promise<PublishResult>;
  /**
   * The record's live event, read again just before its correction is
   * published. A record that changed since it was planned (a demotion, a seed
   * write) is skipped, never overwritten. Absent = trust the planned event.
   */
  readonly latest?: (slug: string) => Promise<SignedNostrEvent | undefined>;
};

/**
 * Gather the evidence, plan, log the plan, and (with `publish`) publish one
 * corrected record per correction. Plans everything before publishing anything.
 */
export async function runYearCorrection(deps: YearRunDeps): Promise<{
  readonly plan: YearPlan;
  readonly published: number;
  readonly failed: number;
  readonly stale: number;
}> {
  const pending = candidates(deps.events, deps.librarian);
  const works = await deps.fetchWorks([...new Set(pending.map((c) => c.record.openLibraryId!))]);
  const authorKeys = new Set<string>();
  for (const c of pending) {
    const key = works.get(c.record.openLibraryId!)?.authorKey;
    if (key) authorKeys.add(key);
  }
  const authors = await deps.fetchAuthors([...authorKeys]);

  const plan = planYearCorrections(deps.events, deps.librarian, works, authors, deps.currentYear);
  for (const l of formatPlan(plan)) deps.log(l);
  if (!deps.publish) return { plan, published: 0, failed: 0, stale: 0 };

  let published = 0;
  let failed = 0;
  let stale = 0;
  for (const c of plan.corrections) {
    const live = deps.latest ? await deps.latest(c.slug) : c.event;
    if (!live || live.id !== c.event.id) {
      stale++;
      deps.log(`stale\t${c.slug}\tchanged since it was planned; run years-check again`);
      continue;
    }
    let template: NostrEventTemplate;
    try {
      template = correctedRecordTemplate(live, c.to, deps.now());
    } catch (err) {
      failed++;
      deps.log(`failed\t${c.slug}\t${(err as Error).message}`);
      continue;
    }
    const r = await deps.publish(template);
    if (r.ok) {
      published++;
      deps.log(`published\t${c.slug}\t${c.year}\t${c.to}`);
    } else {
      failed++;
      deps.log(`failed\t${c.slug}\t${r.reason ?? "refused"}`);
    }
  }
  return { plan, published, failed, stale };
}
