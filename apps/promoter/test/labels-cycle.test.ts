// FAILING TESTS — Story 105 / ADR 0094 §4: the labels pass. Fully injected:
// fake reads, a FAKE librarian signer, fake publishers.
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  bookLabels,
  buildBookRecordsHeaderAddress,
  formatAddress,
  labelsOf,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { runLabelsCycle, type LabelsDeps } from "../src/labels";
import {
  buildBookAssertionEventsForTest,
  buildBookTagEventForTest,
} from "../../../packages/search/test/_tag-fixtures";

const LIB = asHexPubkey("1".repeat(63) + "a");
const BOOKS_Z = formatAddress(buildBookRecordsHeaderAddress(LIB));
const NOW = 1_790_000_000;

function record(slug: string, extra: string[][] = [], at = NOW - 1000, pubkey: string = LIB): SignedNostrEvent {
  return {
    id: `${slug}-${at}`.padEnd(64, "0").slice(0, 64),
    pubkey,
    kind: 39999,
    created_at: at,
    content: `Blurb of ${slug}.`,
    tags: [["d", slug], ["z", BOOKS_Z], ["t", slug], ["title", slug], ["author", "A"], ["format", "reference"], ["lang", "eng"], ["json", "{}"], ...extra],
    sig: "f".repeat(128),
  } as SignedNostrEvent;
}

const taxonomy = [buildBookTagEventForTest("fantasy", "genre", "Fantasy", "normal")];

function makeDeps(over: Partial<LabelsDeps> = {}) {
  const published: { where: string; event: SignedNostrEvent }[] = [];
  const snapshot = new Map<string, SignedNostrEvent>();
  const deps: LabelsDeps = {
    librarianPubkey: LIB,
    readBooks: vi.fn(async () => [record("orbital"), record("dune")]),
    readCurrent: undefined as unknown as LabelsDeps["readCurrent"],
    readTaxonomy: vi.fn(async () => taxonomy),
    readAssertions: vi.fn(async () => buildBookAssertionEventsForTest("orbital", [["a".repeat(64), "fantasy", 1]])),
    sign: vi.fn((t) => ({ ...t, id: `signed-${t.tags.find((x: string[]) => x[0] === "d")?.[1]}`, pubkey: LIB, sig: "e".repeat(128) }) as unknown as SignedNostrEvent),
    publishDcosl: vi.fn(async (event) => { published.push({ where: "dcosl", event }); return { ok: true as const, id: event.id }; }),
    publishLocal: vi.fn(async (event) => { published.push({ where: "local", event }); return { ok: true as const, id: event.id }; }),
    now: () => NOW,
    log: () => undefined,
    ...over,
  };
  // By default the hub holds what the pass read: the newest copy of each slug.
  if (!over.readCurrent) {
    const readBooks = deps.readBooks;
    (deps as { readBooks: LabelsDeps["readBooks"] }).readBooks = async () => {
      const books = await readBooks();
      for (const b of books) {
        const slug = b.tags.find((t) => t[0] === "d")![1]!;
        const prior = snapshot.get(slug);
        if (b.pubkey === LIB && (!prior || b.created_at > prior.created_at)) snapshot.set(slug, b);
      }
      return books;
    };
    (deps as { readCurrent: LabelsDeps["readCurrent"] }).readCurrent = async (slug) => (snapshot.has(slug) ? [snapshot.get(slug)!] : []);
  }
  return { deps, published };
}

describe("runLabelsCycle", () => {
  it("relabels each book whose labels differ: genres from the consensus, format and language from the record", async () => {
    const { deps, published } = makeDeps();
    const summary = await runLabelsCycle(deps);
    expect(summary).toEqual({ checked: 2, relabelled: 2, failed: 0 });
    const orbital = published.find((p) => p.where === "dcosl" && p.event.id === "signed-orbital")!.event;
    expect(labelsOf(orbital.tags)).toEqual({ genres: ["fantasy"], format: "reference", language: "eng" });
    const dune = published.find((p) => p.event.id === "signed-dune")!.event;
    expect(labelsOf(dune.tags)).toEqual({ genres: [], format: "reference", language: "eng" });
  });

  it("keeps the content and every other tag, and dates the new version after the old one", async () => {
    const future = record("orbital", [], NOW + 500);
    const { deps, published } = makeDeps({ readBooks: vi.fn(async () => [future]) });
    await runLabelsCycle(deps);
    const out = published[0]!.event;
    expect(out.content).toBe("Blurb of orbital.");
    expect(out.created_at).toBe(NOW + 501);
    expect(out.tags.filter((t) => t[0] !== "L" && t[0] !== "l" && t[0] !== "added")).toEqual(future.tags);
  });

  it("publishes to the hub first, then Unbnd's relay; a hub refusal publishes nothing locally and counts as failed", async () => {
    const { deps, published } = makeDeps({
      publishDcosl: vi.fn(async (e: SignedNostrEvent) =>
        e.id === "signed-orbital" ? ({ ok: false as const, reason: "blocked" }) : ({ ok: true as const, id: e.id })),
    });
    const summary = await runLabelsCycle(deps);
    expect(summary).toEqual({ checked: 2, relabelled: 1, failed: 1 });
    expect(published.map((p) => `${p.where}:${p.event.id}`)).toEqual(["local:signed-dune"]);
  });

  it("a book already carrying the right labels is left alone", async () => {
    const labelled = record("dune", bookLabels({ genres: [], format: "reference", language: "eng" }));
    const { deps, published } = makeDeps({ readBooks: vi.fn(async () => [labelled]) });
    expect(await runLabelsCycle(deps)).toEqual({ checked: 1, relabelled: 0, failed: 0 });
    expect(published).toEqual([]);
  });

  it("only the librarian's own, newest, listed records are touched", async () => {
    const stranger = record("orbital", [], NOW - 10, "b".repeat(64));
    const older = record("dune", [], NOW - 5000);
    const newer = record("dune", bookLabels({ genres: [], format: "reference", language: "eng" }), NOW - 100);
    const delisted = record("gone", [["delisted", "true"]]);
    const { deps, published } = makeDeps({ readBooks: vi.fn(async () => [stranger, older, newer, delisted]) });
    expect(await runLabelsCycle(deps)).toEqual({ checked: 1, relabelled: 0, failed: 0 });
    expect(published).toEqual([]);
  });

  it("a signing error on one book is counted and the pass goes on", async () => {
    const { deps } = makeDeps({
      sign: vi.fn((t) => {
        if (t.tags.some((x: string[]) => x[0] === "d" && x[1] === "orbital")) throw new Error("signer down");
        return { ...t, id: "signed-dune", pubkey: LIB, sig: "e".repeat(128) } as unknown as SignedNostrEvent;
      }),
    });
    expect(await runLabelsCycle(deps)).toEqual({ checked: 2, relabelled: 1, failed: 1 });
  });

  it("stamps the first-added date from the record's own created_at, and keeps one already there", async () => {
    const fresh = record("orbital", [], NOW - 1000);
    const stamped = record("dune", [["added", "1700000000"]], NOW - 900);
    const { deps, published } = makeDeps({ readBooks: vi.fn(async () => [fresh, stamped]) });
    await runLabelsCycle(deps);
    const added = (id: string) => published.find((p) => p.event.id === id)!.event.tags.filter((t) => t[0] === "added");
    expect(added("signed-orbital")).toEqual([["added", String(NOW - 1000)]]);
    expect(added("signed-dune")).toEqual([["added", "1700000000"]]);
  });

  it("builds on the hub's current version, not the snapshot (ADR 0094 §5)", async () => {
    const snap = record("orbital", [["year", "1990"]], NOW - 1000);
    const current = record("orbital", [["year", "2001"]], NOW - 10);
    const { deps, published } = makeDeps({
      readBooks: vi.fn(async () => [snap]),
      readCurrent: vi.fn(async () => [snap, current]),
    });
    expect(await runLabelsCycle(deps)).toEqual({ checked: 1, relabelled: 1, failed: 0 });
    const out = published[0]!.event;
    expect(out.tags).toContainEqual(["year", "2001"]);
    expect(out.tags).not.toContainEqual(["year", "1990"]);
    expect(out.created_at).toBe(NOW);
    expect(out.tags).toContainEqual(["added", String(NOW - 10)]);
  });

  it("a record delisted since the snapshot is left alone", async () => {
    const { deps, published } = makeDeps({
      readBooks: vi.fn(async () => [record("orbital")]),
      readCurrent: vi.fn(async () => [record("orbital", [["delisted", "true"]], NOW - 5)]),
    });
    expect(await runLabelsCycle(deps)).toEqual({ checked: 1, relabelled: 0, failed: 0 });
    expect(published).toEqual([]);
  });

  it("a delisting that reached only Unbnd's relay wins over the hub's older listed copy", async () => {
    const { deps, published } = makeDeps({
      readBooks: vi.fn(async () => [record("orbital")]),
      readCurrent: vi.fn(async () => [record("orbital", [], NOW - 1000), record("orbital", [["delisted", "true"]], NOW - 5)]),
    });
    expect(await runLabelsCycle(deps)).toEqual({ checked: 1, relabelled: 0, failed: 0 });
    expect(published).toEqual([]);
  });

  it("a record neither relay returns is counted as failed and not written", async () => {
    const { deps, published } = makeDeps({
      readBooks: vi.fn(async () => [record("orbital")]),
      readCurrent: vi.fn(async () => []),
    });
    expect(await runLabelsCycle(deps)).toEqual({ checked: 1, relabelled: 0, failed: 1 });
    expect(published).toEqual([]);
  });

  it("an empty book list, tag list or assertion read stops the pass before it writes anything", async () => {
    for (const over of [
      { readTaxonomy: vi.fn(async () => []) },
      { readBooks: vi.fn(async () => []) },
      { readAssertions: vi.fn(async () => []) },
    ]) {
      const { deps, published } = makeDeps(over);
      const summary = await runLabelsCycle(deps);
      expect(summary).toMatchObject({ checked: 0, relabelled: 0, failed: 0 });
      expect(summary.stopped).toMatch(/empty/);
      expect(published).toEqual([]);
    }
  });

  it("a local publish that throws after the hub accepted still counts as relabelled", async () => {
    const { deps } = makeDeps({ publishLocal: vi.fn(async () => { throw new Error("socket closed"); }) });
    expect(await runLabelsCycle(deps)).toEqual({ checked: 2, relabelled: 2, failed: 0 });
  });
});
