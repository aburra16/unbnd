// What the import does with each candidate (Story 109 / ADR 0097 §1, §4–§6),
// and the record event it publishes. The seeder's rules decide and build each
// book; nothing here re-states them. Pure: no I/O.
import {
  BOOK_FORMAT_NAMESPACE,
  BOOK_LANGUAGE_NAMESPACE,
  BOOK_RECORD_TAG_NAMES,
  fromBookRecordEvent,
  fromWireEvent,
  isDelistedRecord,
  toBookRecordEvent,
  toWireTemplate,
  type BookRecord,
  type DListAddress,
  type NostrEventTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { capBlurb, sanitizeDescription } from "../description";
import { fingerprint } from "../fingerprint";
import { gateReason, type OLSearchDoc } from "../gate";
import { subjectsToGenres } from "../genres";
import { workEvidenceOf, type AuthorEvidence } from "../ol-evidence";
import { mapSearchDocToBookRecord } from "../openlibrary";
import { judgeRecordYear, withJudgedYear } from "../year-corrections";

/** The tier: the gate plus at least this many Open Library readers (ADR 0097 §1). */
export const READERS_MIN = 5;

export type Candidate = {
  readonly doc: OLSearchDoc;
  readonly readers: number;
  readonly description?: string;
};

/** What the import needs to know about a record already on the hub. */
export type LiveSummary = {
  readonly owned: boolean;
  readonly fingerprint: string | null;
  readonly added: number;
  /**
   * The book's identity as the catalog shows it: kept when the dump would only
   * pick another valid value (the 2026-09-30 dry run: another ISBN of the same
   * work for 9,876 books, a ghostwriter for a pen name for 164).
   */
  readonly identity: Partial<Pick<BookRecord, "title" | "authorName" | "isbn13" | "isbn10">>;
  /** Tags a rebuild would drop: genre labels, foreign labels, unknown tags, other `i` tags. */
  readonly carried: readonly (readonly string[])[];
};

export type Plan =
  | { readonly kind: "dropped"; readonly reason: string }
  | { readonly kind: "not-owned" }
  | { readonly kind: "unchanged" }
  | {
      readonly kind: "new" | "changed";
      readonly record: BookRecord;
      readonly genres: readonly string[];
      readonly yearCorrected?: { readonly from: number; readonly to: number };
    };

const SCHEMA_TAGS = new Set<string>(BOOK_RECORD_TAG_NAMES);
const REBUILT_LABELS = new Set<string>([BOOK_FORMAT_NAMESPACE, BOOK_LANGUAGE_NAMESPACE]);

/** Whether a rebuild of the record writes this tag itself (so it is not carried). */
function rebuiltTag(t: readonly string[]): boolean {
  const name = t[0] ?? "";
  if (name === "json" || name === "added" || SCHEMA_TAGS.has(name)) return true;
  if (name === "L") return REBUILT_LABELS.has(t[1] ?? "");
  if (name === "l") return REBUILT_LABELS.has(t[2] ?? "");
  if (name === "i") return (t[1] ?? "").startsWith("isbn:");
  return false;
}

/** The import's view of a live record (ADR 0097 §5–§6). */
export function liveSummary(event: SignedNostrEvent): LiveSummary {
  const tag = (name: string) => event.tags.find((t) => t[0] === name)?.[1];
  let record: BookRecord | null = null;
  try {
    record = fromBookRecordEvent(fromWireEvent(event) as never);
  } catch {
    record = null;
  }
  const owned =
    !isDelistedRecord(event) &&
    record !== null &&
    record.source === "openlibrary" &&
    !record.submittedBy &&
    tag("submitted-by") === undefined;
  const added = Number(tag("added"));
  const identity: LiveSummary["identity"] = {};
  for (const f of ["title", "authorName", "isbn13", "isbn10"] as const) {
    const v = record?.[f];
    if (typeof v === "string" && v.trim()) (identity as Record<string, string>)[f] = v;
  }
  return {
    owned,
    identity,
    fingerprint: record ? fingerprint(record) : null,
    added: Number.isInteger(added) && added > 0 ? added : event.created_at,
    carried: event.tags.filter((t) => !rebuiltTag(t)).map((t) => [...t]),
  };
}

export function planBook(
  candidate: Candidate,
  live: LiveSummary | undefined,
  authors: ReadonlyMap<string, AuthorEvidence>,
  header: DListAddress<39998>,
  currentYear: number,
): Plan {
  const reason = gateReason(candidate.doc, currentYear);
  if (reason) return { kind: "dropped", reason };
  if (candidate.readers < READERS_MIN) return { kind: "dropped", reason: "readers" };
  if (live && !live.owned) return { kind: "not-owned" };

  const mapped = mapSearchDocToBookRecord(candidate.doc, header);
  if (!mapped) return { kind: "dropped", reason: "map" };
  const judged = withJudgedYear(
    mapped,
    judgeRecordYear(mapped, workEvidenceOf(candidate.doc), authors, currentYear),
  );
  const blurb = candidate.description ? capBlurb(sanitizeDescription(candidate.description)) : "";
  // An existing book keeps its title, author and ISBNs; the dump fills them only when empty.
  const record: BookRecord = { ...judged, ...(blurb ? { blurb } : {}), ...(live?.identity ?? {}) };

  if (live && live.fingerprint === fingerprint(record)) return { kind: "unchanged" };
  const yearCorrected =
    mapped.publishYear !== undefined && record.publishYear !== mapped.publishYear
      ? { from: mapped.publishYear, to: record.publishYear as number }
      : undefined;
  return {
    kind: live ? "changed" : "new",
    record,
    genres: subjectsToGenres(record.subjects ?? []),
    ...(yearCorrected ? { yearCorrected } : {}),
  };
}

/**
 * The record event to publish: the schema's event for the rebuilt record, plus,
 * for a record already on the hub, its first-added date and the tags a rebuild
 * does not write (ADR 0097 §6).
 */
export function recordEventFor(
  record: BookRecord,
  live: LiveSummary | undefined,
  createdAt: number,
): NostrEventTemplate {
  const template = toWireTemplate(toBookRecordEvent(record), createdAt);
  if (!live) return template;
  return {
    ...template,
    tags: [...template.tags, ["added", String(live.added)], ...live.carried.map((t) => [...t])],
  };
}
