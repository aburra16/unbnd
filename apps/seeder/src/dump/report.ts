// The import's report (Story 109 / ADR 0097 §8): what a run would do, or did,
// in counts and samples, for the operator to read before publishing.
import type { FingerprintInput } from "../fingerprint";
import type { Plan } from "./plan";

/** The content fields a change is measured on: the fingerprint's. */
const FIELDS = ["title", "authorName", "blurb", "coverUrl", "publishYear", "subjects", "isbn13", "language", "pageCount"] as const;
const SAMPLES = 25;

const text = (v: unknown) => (v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v));

export class ImportReport {
  readonly counts: Record<string, number> = {};
  readonly dropped: Record<string, number> = {};
  readonly changedFields: Record<string, number> = {};
  yearCorrections = 0;
  readonly samples = {
    new: [] as Array<{ slug: string; title: string; author: string; year?: number }>,
    changed: [] as Array<{ slug: string; fields: Record<string, [string, string]> }>,
  };

  constructor(readonly dump: string) {}

  /** One candidate's plan; `before` is the live record's content for a change. */
  add(plan: Plan, before?: FingerprintInput): void {
    this.counts[plan.kind] = (this.counts[plan.kind] ?? 0) + 1;
    if (plan.kind === "dropped") {
      this.dropped[plan.reason] = (this.dropped[plan.reason] ?? 0) + 1;
      return;
    }
    if (plan.kind !== "new" && plan.kind !== "changed") return;
    if (plan.yearCorrected) this.yearCorrections++;
    const r = plan.record;
    if (plan.kind === "new") {
      if (this.samples.new.length < SAMPLES) {
        this.samples.new.push({
          slug: r.slug,
          title: r.title,
          author: r.authorName,
          ...(r.publishYear !== undefined ? { year: r.publishYear } : {}),
        });
      }
      return;
    }
    const fields: Record<string, [string, string]> = {};
    for (const f of FIELDS) {
      const was = text(before?.[f]);
      const now = text((r as FingerprintInput)[f]);
      if (was !== now) {
        fields[f] = [was, now];
        this.changedFields[f] = (this.changedFields[f] ?? 0) + 1;
      }
    }
    if (this.samples.changed.length < SAMPLES) this.samples.changed.push({ slug: r.slug, fields });
  }

  toJSON() {
    return {
      dump: this.dump,
      counts: this.counts,
      dropped: this.dropped,
      yearCorrections: this.yearCorrections,
      changedFields: this.changedFields,
      samples: this.samples,
    };
  }
}
