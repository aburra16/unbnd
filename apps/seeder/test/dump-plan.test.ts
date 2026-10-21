// FAILING TESTS — Story 109 / ADR 0097 §1, §4–§6: what the import does with
// each candidate, and what a republished record keeps.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  bookLabels,
  buildBookRecordsHeaderAddress,
  toBookRecordEvent,
  toWireTemplate,
  withBookLabels,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import type { OLSearchDoc } from "../src/gate";
import { liveSummary, planBook, recordEventFor, READERS_MIN } from "../src/dump/plan";
import { mapSearchDocToBookRecord } from "../src/openlibrary";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HEADER = buildBookRecordsHeaderAddress(LIB);
const YEAR = 2026;

const doc = (o: Partial<OLSearchDoc> = {}): OLSearchDoc => ({
  key: "/works/OL77W",
  title: "Orbital",
  author_name: ["Samantha Harvey"],
  author_key: ["OL5A"],
  edition_count: 5,
  cover_i: 123,
  language: ["eng"],
  number_of_pages_median: 207,
  publish_year: [2023, 2024],
  first_publish_year: 2023,
  isbn: ["9780802163103"],
  subject: ["Space stations", "Fiction"],
  ...o,
});
const cand = (o: Partial<OLSearchDoc> = {}, readers = 12, description?: string) => ({
  doc: doc(o),
  readers,
  ...(description ? { description } : {}),
});
const AUTHORS = new Map([["OL5A", { name: "Samantha Harvey", birthYear: 1975 }]]);

function liveEvent(o: { at?: number; extra?: string[][]; source?: string; year?: number } = {}): SignedNostrEvent {
  const rec = { ...mapSearchDocToBookRecord(doc(o.year ? { first_publish_year: o.year } : {}), HEADER)!, ...(o.source ? { source: o.source as never } : {}) };
  const t = toWireTemplate(toBookRecordEvent(rec), o.at ?? 1_780_000_000);
  return { ...t, tags: [...t.tags, ...(o.extra ?? [])], id: "f".repeat(64), pubkey: LIB, sig: "s" } as SignedNostrEvent;
}

describe("planBook", () => {
  it("the tier is the gate plus 5 readers", () => {
    expect(READERS_MIN).toBe(5);
    expect(planBook(cand({}, 4), undefined, AUTHORS, HEADER, YEAR)).toEqual({ kind: "dropped", reason: "readers" });
    expect(planBook(cand({ cover_i: undefined }), undefined, AUTHORS, HEADER, YEAR)).toEqual({ kind: "dropped", reason: "cover" });
  });

  it("a book not on the hub is new, with its blurb, judged year and genres", () => {
    const p = planBook(cand({}, 12, "  A day aboard a space station.  "), undefined, AUTHORS, HEADER, YEAR);
    expect(p.kind).toBe("new");
    if (p.kind !== "new") return;
    expect(p.record).toMatchObject({ slug: "ol-ol77w", blurb: "A day aboard a space station.", publishYear: 2023 });
    expect(p.genres.length).toBeGreaterThan(0);
  });

  it("a year the author could not have written is corrected, and reported", () => {
    const p = planBook(cand({ first_publish_year: 1800, publish_year: [1800, 2023] }), undefined, AUTHORS, HEADER, YEAR);
    expect(p).toMatchObject({ kind: "new", record: { publishYear: 2023 }, yearCorrected: { from: 1800, to: 2023 } });
  });

  it("an owned record with the same content is unchanged; with different content, changed", () => {
    const same = liveSummary(liveEvent());
    expect(planBook(cand(), same, AUTHORS, HEADER, YEAR).kind).toBe("unchanged");
    const older = liveSummary(liveEvent({ year: 2021 }));
    expect(planBook(cand(), older, AUTHORS, HEADER, YEAR).kind).toBe("changed");
  });

  it("community, submitted and delisted records are never touched", () => {
    for (const ev of [
      liveEvent({ source: "community" }),
      liveEvent({ extra: [["submitted-by", "b".repeat(64)]] }),
      liveEvent({ extra: [["delisted", "true"]] }),
    ]) {
      expect(planBook(cand(), liveSummary(ev), AUTHORS, HEADER, YEAR).kind).toBe("not-owned");
    }
  });
});

describe("recordEventFor", () => {
  it("a new record is the schema's event, dated as given", () => {
    const p = planBook(cand(), undefined, AUTHORS, HEADER, YEAR);
    if (p.kind !== "new") throw new Error("expected new");
    const t = recordEventFor(p.record, undefined, 1_790_000_123);
    expect(t.created_at).toBe(1_790_000_123);
    expect(t.tags).toContainEqual(["d", "ol-ol77w"]);
    expect(t.tags.some((x) => x[0] === "added")).toBe(false);
  });

  it("a changed record keeps its first-added date, its genre labels and tags the schema does not write", () => {
    const live = liveSummary(liveEvent({
      year: 2021,
      at: 1_780_000_000,
      extra: [...withBookLabels([], bookLabels({ genres: ["literary-fiction"] })), ["x-note", "kept"]],
    }));
    const p = planBook(cand(), live, AUTHORS, HEADER, YEAR);
    if (p.kind !== "changed") throw new Error("expected changed");
    const t = recordEventFor(p.record, live, 1_790_000_000);
    expect(t.tags).toContainEqual(["added", "1780000000"]);
    expect(t.tags).toContainEqual(["l", "literary-fiction", "ink.unbnd.genre"]);
    expect(t.tags).toContainEqual(["x-note", "kept"]);
    expect(t.tags).toContainEqual(["year", "2023"]);
    expect(t.tags.filter((x) => x[0] === "d")).toEqual([["d", "ol-ol77w"]]);
  });

  it("a live record that already has an added tag keeps that one", () => {
    const live = liveSummary(liveEvent({ year: 2021, at: 1_785_000_000, extra: [["added", "1770000000"]] }));
    const p = planBook(cand(), live, AUTHORS, HEADER, YEAR);
    if (p.kind !== "changed") throw new Error("expected changed");
    expect(recordEventFor(p.record, live, 1_790_000_000).tags.filter((x) => x[0] === "added")).toEqual([["added", "1770000000"]]);
  });

});

describe("an existing book keeps its identity (dry run of 2026-09-30)", () => {
  it("keeps the live title, author, ISBNs and page count, and still takes new content from the dump", () => {
    const liveRec = liveEvent({ year: 2021 });
    const tags = liveRec.tags.map((t) => (t[0] === "author" ? ["author", "Carolyn Keene"] : t[0] === "isbn" ? ["isbn", "9780000000002"] : t));
    const json = JSON.parse(tags.find((t) => t[0] === "json")![1]!);
    json.bookSubmission.authorName = "Carolyn Keene";
    json.bookSubmission.isbn13 = "9780000000002";
    const live = liveSummary({ ...liveRec, tags: tags.map((t) => (t[0] === "json" ? ["json", JSON.stringify(json)] : t)) });
    const p = planBook(cand({ author_name: ["Leslie McFarlane"], isbn: ["9780802163103"], number_of_pages_median: 210 }), live, AUTHORS, HEADER, YEAR);
    expect(p.kind).toBe("changed");
    if (p.kind !== "changed") return;
    expect(p.record).toMatchObject({ authorName: "Carolyn Keene", isbn13: "9780000000002", publishYear: 2023, pageCount: 207 });
  });

  it("a live record with no ISBN takes the dump's", () => {
    const liveRec = liveEvent({ year: 2021 });
    const json = JSON.parse(liveRec.tags.find((t) => t[0] === "json")![1]!);
    delete json.bookSubmission.isbn13;
    const live = liveSummary({ ...liveRec, tags: liveRec.tags.filter((t) => t[0] !== "isbn").map((t) => (t[0] === "json" ? ["json", JSON.stringify(json)] : t)) });
    const p = planBook(cand(), live, AUTHORS, HEADER, YEAR);
    if (p.kind !== "changed") throw new Error("expected changed");
    expect(p.record.isbn13).toBe("9780802163103");
  });

});

describe("a work Open Library merged into another (review round 1)", () => {
  it("the merge target of a book already in the catalog is skipped and counted, not added twice", () => {
    expect(planBook(cand(), undefined, AUTHORS, HEADER, YEAR, { mergedFromCatalog: true })).toEqual({ kind: "dropped", reason: "merged" });
  });

  it("a merge target that is itself in the catalog is planned as usual (review round 2)", () => {
    const p = planBook(cand(), liveSummary(liveEvent()), AUTHORS, HEADER, YEAR, { mergedFromCatalog: true });
    expect(p.kind).toBe("unchanged");
  });
});
