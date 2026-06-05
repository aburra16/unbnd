// Per-record content fingerprint (ADR 0051 Decision 3, Option A). A stable
// short hash of the canonical fields that go into a published BookRecord
// event, so the seeder's checkpoint can be surgical: an unchanged record skips
// (same fp), a changed record (e.g. one that gained a blurb) re-publishes
// (different fp). This is change detection, not a cryptographic use; per the
// crypto policy we still hash via the audited node:crypto, never hand-rolled.
import { createHash } from "node:crypto";

/** A record carrying the canonical content fields that drive a re-publish. */
export type FingerprintInput = {
  readonly title?: unknown;
  readonly authorName?: unknown;
  readonly blurb?: unknown;
  readonly coverUrl?: unknown;
  readonly publishYear?: unknown;
  readonly subjects?: unknown;
  readonly isbn13?: unknown;
  readonly language?: unknown;
  readonly pageCount?: unknown;
};

function field(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.map((v) => String(v)).join(",");
  return String(value);
}

/**
 * A stable 12-char fingerprint of a record's canonical content. Identical
 * content yields the same fingerprint across runs; any change to title,
 * author, blurb, cover, publish year, subjects, or the enrichment fields
 * (isbn13, language, pageCount) yields a different one.
 */
export function fingerprint(record: FingerprintInput): string {
  const canonical = [
    field(record.title),
    field(record.authorName),
    field(record.blurb),
    field(record.coverUrl),
    field(record.publishYear),
    field(record.subjects),
    field(record.isbn13),
    field(record.language),
    field(record.pageCount),
  ].join(""); // ASCII unit separator, absent from the field values
  return createHash("sha256").update(canonical, "utf8").digest("hex").slice(0, 12);
}
