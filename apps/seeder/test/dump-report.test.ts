// FAILING TESTS — Story 109 / ADR 0097 §8: the dry run's report.
import { describe, expect, it } from "vitest";
import { asHexPubkey, buildBookRecordsHeaderAddress, type BookRecord } from "@unbnd/schemas";
import { ImportReport } from "../src/dump/report";

const HEADER = buildBookRecordsHeaderAddress(asHexPubkey("1".repeat(63) + "a"));
const rec = (o: Partial<BookRecord> = {}): BookRecord => ({
  slug: "ol-ol1w", title: "Orbital", authorName: "Samantha Harvey", format: "reference", source: "openlibrary",
  parentHeader: HEADER, publishYear: 2023, pageCount: 207, isbn13: "9780802163103", ...o,
});

describe("ImportReport", () => {
  it("counts each outcome, each gate signal, and year corrections, with samples", () => {
    const r = new ImportReport("2026-09-30");
    r.add({ kind: "dropped", reason: "cover" });
    r.add({ kind: "dropped", reason: "cover" });
    r.add({ kind: "dropped", reason: "readers" });
    r.add({ kind: "not-owned" });
    r.add({ kind: "unchanged" });
    r.add({ kind: "new", record: rec({ slug: "ol-ol2w", title: "Dune" }), genres: ["science-fiction"], yearCorrected: { from: 1800, to: 1965 } });
    r.add({ kind: "changed", record: rec({ pageCount: 210 }), genres: [] }, rec());
    const out = r.toJSON();
    expect(out).toMatchObject({
      dump: "2026-09-30",
      counts: { dropped: 3, "not-owned": 1, unchanged: 1, new: 1, changed: 1 },
      dropped: { cover: 2, readers: 1 },
      yearCorrections: 1,
      changedFields: { pageCount: 1 },
    });
    expect(out.samples.new).toEqual([{ slug: "ol-ol2w", title: "Dune", author: "Samantha Harvey", year: 1965 }]);
    expect(out.samples.changed[0]).toMatchObject({ slug: "ol-ol1w", fields: { pageCount: ["207", "210"] } });
  });
});
