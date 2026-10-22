// FAILING TESTS — Story 106 / ADR 0095: the NIP-50 search provider. The relay
// read is injected; no socket here.
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  bookLabels,
  buildBookRecordsHeaderAddress,
  formatAddress,
  toBookRecordEvent,
  toWireTemplate,
  withBookLabels,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { Nip50Provider } from "../src/nip50";

const LIB = asHexPubkey("1".repeat(63) + "a");
const BOOKS_Z = formatAddress(buildBookRecordsHeaderAddress(LIB));
let seq = 0;

function book(slug: string, o: { at?: number; pubkey?: string; extra?: string[][]; year?: number; language?: string; format?: "reference" | "ebook" } = {}): SignedNostrEvent {
  const t = toWireTemplate(
    toBookRecordEvent({
      slug,
      title: `Title ${slug}`,
      authorName: `Author ${slug}`,
      blurb: `About ${slug}.`,
      publishYear: o.year ?? 2001,
      language: o.language ?? "eng",
      format: o.format ?? "reference",
      source: "openlibrary",
      coverUrl: `https://covers.example/${slug}.jpg`,
      parentHeader: buildBookRecordsHeaderAddress(LIB),
    }),
    o.at ?? 1_790_000_000,
  );
  seq++;
  return { ...t, tags: [...t.tags, ...(o.extra ?? [])], id: seq.toString(16).padStart(64, "0"), pubkey: o.pubkey ?? LIB, sig: "f".repeat(128) } as SignedNostrEvent;
}

function provider(events: SignedNostrEvent[], now = { t: 1_000 }, verify: (e: SignedNostrEvent) => boolean = () => true) {
  const query = vi.fn(async () => events);
  const p = new Nip50Provider({ librarian: LIB, query, verify, now: () => now.t });
  return { p, query, now };
}

describe("Nip50Provider.search", () => {
  it("asks the relay once for the top 100 of the librarian's books matching the text", async () => {
    const { p, query } = provider([book("a")]);
    await p.search({ q: "island", limit: 20, offset: 0 });
    expect(query).toHaveBeenCalledWith({
      kinds: [39999],
      authors: [LIB],
      "#z": [BOOKS_Z],
      search: "island include:spam",
      limit: 100,
    });
  });

  it("keeps the relay's order, scores by rank, and maps the record's display fields", async () => {
    const { p } = provider([book("first", { year: 1200 }), book("second"), book("third")]);
    const r = await p.search({ q: "x", limit: 20, offset: 0 });
    expect(r.hits.map((h) => h.slug)).toEqual(["first", "second", "third"]);
    expect(r.hits.map((h) => h.score)).toEqual([1, 2 / 3, 1 / 3]);
    expect(r.hits[1]).toMatchObject({ title: "Title second", authorName: "Author second", blurb: "About second.", coverUrl: "https://covers.example/second.jpg", publishYear: 2001, format: "reference" });
    expect(r.hits[0]!.publishYear).toBeUndefined(); // before printing: no year (ADR 0091)
    expect(r).toMatchObject({ total: 3, offset: 0, limit: 20, capped: false });
  });

  it("drops delisted, junk, foreign and superseded records", async () => {
    const { p } = provider([
      book("dup", { at: 100 }),
      book("gone", { extra: [["delisted", "true"]] }),
      book("stranger", { pubkey: "b".repeat(64) }),
      book("dup", { at: 200, year: 1999 }),
      book("junk", { year: 3000 }),
      book("ok"),
    ]);
    const r = await p.search({ q: "x", limit: 20, offset: 0 });
    expect(r.hits.map((h) => h.slug)).toEqual(["dup", "ok"]);
    expect(r.hits[0]!.publishYear).toBe(1999);
  });

  it("pages within one ranked list and reads the relay once per query", async () => {
    const many = Array.from({ length: 100 }, (_, i) => book(`b${String(i).padStart(3, "0")}`));
    const { p, query } = provider(many);
    const one = await p.search({ q: "x", limit: 20, offset: 0 });
    const two = await p.search({ q: "x", limit: 20, offset: 20 });
    expect(query).toHaveBeenCalledTimes(1);
    expect(one.hits[0]!.slug).toBe("b000");
    expect(two.hits[0]!.slug).toBe("b020");
    expect(two).toMatchObject({ total: 100, capped: true });
  });

  it("asks again once the list is two minutes old, or for another query", async () => {
    const { p, query, now } = provider([book("a")]);
    await p.search({ q: "x", limit: 20, offset: 0 });
    now.t += 119_000;
    await p.search({ q: "x", limit: 20, offset: 0 });
    expect(query).toHaveBeenCalledTimes(1);
    now.t += 2_000;
    await p.search({ q: "x", limit: 20, offset: 0 });
    await p.search({ q: "y", limit: 20, offset: 0 });
    expect(query).toHaveBeenCalledTimes(3);
  });

  it("filters genre at the relay by label, and format and language on the record", async () => {
    const { p, query } = provider([
      book("fr", { language: "fre" }),
      book("en-ebook", { format: "ebook" }),
      book("en", { extra: withBookLabels([], bookLabels({ genres: ["fantasy"], format: "reference", language: "eng" })) }),
    ]);
    const r = await p.search({ q: "x", limit: 20, offset: 0, filters: { genre: "fantasy", language: "eng", format: "reference" } });
    expect(query).toHaveBeenCalledWith(expect.objectContaining({ "#l": ["fantasy"] }));
    expect(r.hits.map((h) => h.slug)).toEqual(["en"]);
  });

  it("a failed relay read fails the search", async () => {
    const p = new Nip50Provider({ librarian: LIB, query: vi.fn(async () => { throw new Error("relay down"); }), verify: () => true });
    await expect(p.search({ q: "x", limit: 20, offset: 0 })).rejects.toThrow(/relay down/);
  });
});

describe("Nip50Provider: ISBN, signatures, shared reads, user text (review round 1)", () => {
  it("an ISBN query is an exact identifier lookup, not a text search", async () => {
    const { p, query } = provider([book("orbital")]);
    await p.search({ q: "978-0-14-143951-8", limit: 8, offset: 0 });
    await p.search({ q: "0141439513", limit: 8, offset: 0 });
    expect(query).toHaveBeenCalledWith({
      kinds: [39999],
      authors: [LIB],
      "#z": [BOOKS_Z],
      "#i": ["isbn:9780141439518"],
      search: "include:spam",
      limit: 100,
    });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("drops an event whose signature does not verify", async () => {
    const good = book("good");
    const forged = book("forged");
    const { p } = provider([forged, good], { t: 1_000 }, (e) => e.id === good.id);
    expect((await p.search({ q: "x", limit: 20, offset: 0 })).hits.map((h) => h.slug)).toEqual(["good"]);
  });

  it("identical searches in flight share one relay read", async () => {
    let release!: (events: SignedNostrEvent[]) => void;
    const query = vi.fn(() => new Promise<SignedNostrEvent[]>((r) => { release = r; }));
    const p = new Nip50Provider({ librarian: LIB, query, verify: () => true });
    const both = Promise.all([p.search({ q: "x", limit: 5, offset: 0 }), p.search({ q: "x", limit: 5, offset: 5 })]);
    release([book("a")]);
    await both;
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("a failed read is not kept: the next search asks again", async () => {
    const query = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValue([book("a")]);
    const p = new Nip50Provider({ librarian: LIB, query, verify: () => true });
    await expect(p.search({ q: "x", limit: 5, offset: 0 })).rejects.toThrow();
    expect((await p.search({ q: "x", limit: 5, offset: 0 })).hits).toHaveLength(1);
  });

  it("search options typed by a user are removed, and the text is capped", async () => {
    const { p, query } = provider([]);
    await p.search({ q: `star wars: a new hope observer:${"c".repeat(64)} domain:x.com`, limit: 5, offset: 0 });
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({ search: "star wars: a new hope include:spam" }));
    await p.search({ q: "w".repeat(500), limit: 5, offset: 0 });
    const last = query.mock.calls.at(-1) as unknown as [{ search: string }];
    expect(last[0].search).toBe(`${"w".repeat(200)} include:spam`);
  });
});

describe("Nip50Provider: titles with colons, empty text (review round 2)", () => {
  it("keeps a colon inside a title and strips only NIP-50 options", async () => {
    const { p, query } = provider([]);
    await p.search({ q: "Re:Zero include:spam language:fr", limit: 5, offset: 0 });
    expect(query).toHaveBeenLastCalledWith(expect.objectContaining({ search: "Re:Zero include:spam" }));
  });

  it("a query that is only options asks the relay nothing and finds nothing", async () => {
    const { p, query } = provider([book("a")]);
    expect(await p.search({ q: "observer:abc sentiment:positive", limit: 5, offset: 0 })).toMatchObject({ hits: [], total: 0, capped: false });
    expect(query).not.toHaveBeenCalled();
  });
});

describe("Nip50Provider health", () => {
  it("health reflects whether the relay answers", async () => {
    expect((await provider([]).p.health()).ok).toBe(true);
    const down = new Nip50Provider({ librarian: LIB, query: vi.fn(async () => { throw new Error("no"); }), verify: () => true });
    expect(await down.health()).toMatchObject({ ok: false, provider: "nip50" });
  });
});

describe("Nip50Provider needs the librarian (story 112 review)", () => {
  it("refuses to start without a hex librarian key", () => {
    for (const librarian of ["", "npub1abc", "z".repeat(64)]) {
      expect(() => new Nip50Provider({ librarian, query: async () => [], verify: () => true })).toThrow(/librarian/);
    }
  });
});
