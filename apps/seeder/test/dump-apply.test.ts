// FAILING TESTS — Story 109 / ADR 0097 §5–§7: publishing the plan, re-checking
// each book against the hub first, paced and resumable.
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  toBookRecordEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { applyPlan, type PlannedBook } from "../src/dump/apply";
import type { Checkpoint } from "../src/checkpoint";
import { fingerprint } from "../src/fingerprint";
import { mapSearchDocToBookRecord } from "../src/openlibrary";

const LIB = asHexPubkey("1".repeat(63) + "a");
const HEADER = buildBookRecordsHeaderAddress(LIB);
const ASSERT_HEADER = buildBookTagAssertionsHeaderAddress(LIB);

const record = (year = 2023) =>
  mapSearchDocToBookRecord(
    { key: "/works/OL77W", title: "Orbital", author_name: ["Samantha Harvey"], cover_i: 1, first_publish_year: year, subject: ["Space"] },
    HEADER,
  )!;
const planned = (o: Partial<PlannedBook> = {}): PlannedBook => ({ slug: "ol-ol77w", kind: "new", record: record(), genres: ["science-fiction"], ...o });
const signed = (t: { kind: number; created_at: number; tags: string[][]; content: string }) =>
  ({ ...t, id: `id-${t.kind}-${t.tags.find((x) => x[0] === "d")?.[1]}`, pubkey: LIB, sig: "s" }) as SignedNostrEvent;
const live = (year: number, extra: string[][] = []) => {
  const t = toWireTemplate(toBookRecordEvent(record(year)), 1_780_000_000);
  return signed({ ...t, tags: [...t.tags, ...extra] });
};
const assertion = (genre: string) =>
  signed(toWireTemplate(toBookTagAssertionEvent({
    bookSlug: "ol-ol77w", bookAddress: { kind: 39999, pubkey: LIB, dTag: "ol-ol77w" }, tagSlug: genre, tagType: "genre",
    polarity: 1, asserterPubkey: LIB, parentHeader: ASSERT_HEADER,
  }), 1_780_000_000));

function memoryCheckpoint(): Checkpoint {
  const s = new Set<string>();
  return { has: (k) => s.has(k), add: (k) => { s.add(k); }, size: () => s.size };
}

function deps(o: { current?: SignedNostrEvent[]; assertions?: SignedNostrEvent[]; checkpoint?: Checkpoint; publishOk?: boolean } = {}) {
  const published: SignedNostrEvent[] = [];
  return {
    published,
    d: {
      librarian: LIB,
      dumpDate: "2026-09-30",
      readCurrent: vi.fn(async () => o.current ?? []),
      readAssertions: vi.fn(async () => o.assertions ?? []),
      sign: vi.fn(signed),
      publish: vi.fn(async (e: SignedNostrEvent) => {
        published.push(e);
        return o.publishOk === false ? { ok: false as const, reason: "no" } : { ok: true as const, id: e.id };
      }),
      checkpoint: o.checkpoint ?? memoryCheckpoint(),
      now: () => 1_790_000_000,
      sleep: vi.fn(async () => {}),
      ratePerSecond: 10,
      log: () => {},
    },
  };
}

describe("applyPlan", () => {
  it("publishes a new book's record, then each genre assertion, pacing every event", async () => {
    const { d, published } = deps();
    const summary = await applyPlan([planned()], d);
    expect(published.map((e) => e.kind)).toEqual([39999, 39999]);
    expect(published[0]!.tags).toContainEqual(["d", "ol-ol77w"]);
    expect(published[1]!.tags.some((t) => t[0] === "a" && t[1] === `39999:${LIB}:ol-ol77w`)).toBe(true);
    expect(d.sleep).toHaveBeenCalledWith(100);
    expect(summary).toMatchObject({ records: 1, assertions: 1, skipped: 0, failed: 0 });
  });

  it("re-checks the hub: a record delisted or made community meanwhile is left alone", async () => {
    for (const current of [live(2021, [["delisted", "true"]]), live(2021, [["submitted-by", "b".repeat(64)]])]) {
      const { d, published } = deps({ current: [current] });
      expect(await applyPlan([planned({ kind: "changed" })], d)).toMatchObject({ records: 0, skipped: 1 });
      expect(published).toEqual([]);
    }
  });

  it("a record that already matches is skipped; a changed one keeps its first-added date", async () => {
    const same = deps({ current: [live(2023)] });
    expect(await applyPlan([planned({ kind: "changed" })], same.d)).toMatchObject({ records: 0, skipped: 1 });
    const older = deps({ current: [live(2021)] });
    await applyPlan([planned({ kind: "changed" })], older.d);
    expect(older.published[0]!.tags).toContainEqual(["added", "1780000000"]);
  });

  it("publishes only genre assertions the librarian has not made", async () => {
    const { d, published } = deps({ assertions: [assertion("science-fiction")] });
    await applyPlan([planned({ genres: ["science-fiction", "fantasy"] })], d);
    const genres = published.filter((e) => e.tags.some((t) => t[0] === "z" && t[1]!.endsWith("book-tag-assertions")));
    expect(genres).toHaveLength(1);
    expect(JSON.stringify(genres[0]!.tags)).toContain("fantasy");
  });

  it("resumes: a book recorded in the checkpoint is not published again", async () => {
    const checkpoint = memoryCheckpoint();
    checkpoint.add(`import:2026-09-30:ol-ol77w:${fingerprint(record())}`);
    const { d, published } = deps({ checkpoint });
    expect(await applyPlan([planned()], d)).toMatchObject({ records: 0, skipped: 1 });
    expect(published).toEqual([]);
  });

  it("a refused record is counted as failed, not checkpointed, and its genres wait", async () => {
    const { d, published } = deps({ publishOk: false });
    expect(await applyPlan([planned()], d)).toMatchObject({ records: 0, failed: 1 });
    expect(published).toHaveLength(1);
    expect(d.checkpoint.size()).toBe(0);
  });
});
