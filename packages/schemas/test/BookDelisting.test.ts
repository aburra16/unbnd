// FAILING TESTS — Story 80 / ADR 0078 (schemas contract).
//
// A catalog delisting is a minimal librarian-authored kind-39999 event at the
// record's OWN address (d-tag = slug; relay-enforced replace, the ADR 0077
// idiom) carrying `["delisted","true"]` and NO record fields. The
// `isDelistedRecord` predicate is the single seam every catalog read uses —
// tag-level, before any payload parse, so a delisted book is dropped
// intentionally, never by parse luck.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  buildBookDelisting,
  buildBookRecordsHeaderAddress,
  isDelistedRecord,
  toBookRecordEvent,
  type BookDelisting,
  type BookRecord,
} from "../src";

const LIBRARIAN = asHexPubkey("1".repeat(63) + "a");
const HDR = buildBookRecordsHeaderAddress(LIBRARIAN);

const delisting: BookDelisting = { slug: "orbital--x", parentHeader: HDR };

const record: BookRecord = {
  slug: "orbital--x",
  title: "Orbital",
  authorName: "Samantha Harvey",
  format: "reference",
  source: "community",
  parentHeader: HDR,
};

function tag(tags: ReadonlyArray<readonly string[]>, name: string) {
  return tags.find((t) => t[0] === name);
}

describe("buildBookDelisting (ADR 0078 §1)", () => {
  it("uses the record's OWN d-tag — the relay-replace identity", () => {
    const event = buildBookDelisting(delisting);
    expect(tag(event.tags, "d")?.[1]).toBe(
      tag(toBookRecordEvent(record).tags, "d")?.[1],
    );
  });

  it("carries the delisted marker, the books z-tag, and NO record fields", () => {
    const event = buildBookDelisting(delisting);
    expect(tag(event.tags, "delisted")?.[1]).toBe("true");
    expect(tag(event.tags, "z")?.[1]).toBe(`39998:${LIBRARIAN}:books`);
    expect(tag(event.tags, "title")).toBeUndefined();
    expect(tag(event.tags, "author")).toBeUndefined();
    expect(tag(event.tags, "source")).toBeUndefined();
    expect(event.content).toBe("");
  });

  it("payload carries the delisted sentinel only", () => {
    const event = buildBookDelisting(delisting);
    expect(event.payload.bookSubmission.delisted).toBe(true);
    expect("title" in event.payload.bookSubmission).toBe(false);
  });
});

describe("isDelistedRecord (the shared catalog-read predicate)", () => {
  it("true for a built delisting", () => {
    expect(isDelistedRecord(buildBookDelisting(delisting))).toBe(true);
  });

  it("false for a normal record event", () => {
    expect(isDelistedRecord(toBookRecordEvent(record))).toBe(false);
  });

  it("false for a non-39999 event even with the marker tag", () => {
    expect(isDelistedRecord({ kind: 1, tags: [["delisted", "true"]] })).toBe(false);
  });
});
