// FAILING TESTS — Story 99 / ADR 0089 §3-5: reading reviews with their
// removals, publishing a review, and the sync with the index.
import { describe, expect, it, vi } from "vitest";
import { readBookReviews, REVIEW_RELAYS } from "../../src/reviews/read";
import { makeReviewPublisher } from "../../src/reviews/publish";
import { runReviewSyncCycle } from "../../src/reviews/relay-sync";
import type { NostrFilter } from "../../src/nostr/query";
import type { SignedNostrEvent } from "@unbnd/schemas";

type Q = (f: NostrFilter) => Promise<SignedNostrEvent[]>;
type Fanout = (relays: readonly string[], e: SignedNostrEvent) => Promise<unknown>;
type Pull = (url: string, f: NostrFilter & { search?: string }) => Promise<SignedNostrEvent[]>;

const LIB = "1".repeat(63) + "a";
const BOOK = `39999:${LIB}:ol-orbital`;
const A = "a".repeat(64);
const ev = (o: Partial<{ id: string; pubkey: string; kind: number; created_at: number; tags: string[][] }>) => ({
  id: o.id ?? "1".repeat(64),
  pubkey: o.pubkey ?? A,
  kind: o.kind ?? 34259,
  created_at: o.created_at ?? 1_790_000_000,
  tags: o.tags ?? [["d", `book:${BOOK}`], ["a", BOOK], ["m", "book"], ["s", "4"]],
  content: "",
  sig: "f".repeat(128),
});

describe("readBookReviews (ADR 0089 §3)", () => {
  it("one book: reads its reviews by #a, then those authors' kind 5 removals", async () => {
    const query = vi.fn<Q>(async (f) => (f.kinds?.includes(5) ? [ev({ kind: 5, id: "2".repeat(64) })] : [ev({})]) as never);
    const events = await readBookReviews(query, { book: BOOK });
    expect(query.mock.calls[0]![0]).toEqual({ kinds: [34259], "#a": [BOOK] });
    expect(query.mock.calls[1]![0]).toEqual({ kinds: [5], authors: [A], "#k": ["34259"] });
    expect(events.map((e) => e.kind)).toEqual([34259, 5]);
  });

  it("some authors: reads their book reviews by #m; every book review: #m alone", async () => {
    const query = vi.fn<Q>(async () => []);
    await readBookReviews(query, { authors: [A] });
    expect(query.mock.calls[0]![0]).toEqual({ kinds: [34259], authors: [A], "#m": ["book"] });
    query.mockClear();
    await readBookReviews(query, { all: true });
    expect(query.mock.calls[0]![0]).toEqual({ kinds: [34259], "#m": ["book"] });
  });

  it("no reviews found: no removal read", async () => {
    const query = vi.fn<Q>(async () => []);
    await readBookReviews(query, { book: BOOK });
    expect(query).toHaveBeenCalledTimes(1);
  });

  it("the review set is the index, nos.lol and primal; never the hub", () => {
    expect(REVIEW_RELAYS).toEqual(["wss://search.brainstorm.world", "wss://nos.lol", "wss://relay.primal.net"]);
  });
});

describe("makeReviewPublisher (ADR 0089 §4)", () => {
  it("publishes locally first, then fans out to the writer's relays and the review set without waiting", async () => {
    const local = vi.fn(async () => ({ ok: true as const, id: "x" }));
    const fanout = vi.fn<Fanout>(async () => []);
    const publish = makeReviewPublisher({ local, fanout, writeRelaysOf: async () => ["wss://writer.example"] });
    const r = await publish(ev({}) as never);
    expect(r.ok).toBe(true);
    await vi.waitFor(() => expect(fanout).toHaveBeenCalled());
    expect(fanout.mock.calls[0]![0]).toEqual(["wss://writer.example", ...REVIEW_RELAYS]);
  });

  it("never sends to the hub, even when the writer lists it", async () => {
    const fanout = vi.fn<Fanout>(async () => []);
    const publish = makeReviewPublisher({
      local: async () => ({ ok: true as const, id: "x" }),
      fanout,
      writeRelaysOf: async () => ["wss://dcosl.brainstorm.world/", "wss://nos.lol"],
    });
    await publish(ev({}) as never);
    await vi.waitFor(() => expect(fanout).toHaveBeenCalled());
    expect(fanout.mock.calls[0]![0]).toEqual(REVIEW_RELAYS);
  });

  it("a local failure fans nothing out and returns the failure", async () => {
    const fanout = vi.fn<Fanout>(async () => []);
    const publish = makeReviewPublisher({
      local: async () => ({ ok: false as const, reason: "down" }),
      fanout,
      writeRelaysOf: async () => [],
    });
    expect((await publish(ev({}) as never)).ok).toBe(false);
    await new Promise((r) => setTimeout(r, 10));
    expect(fanout).not.toHaveBeenCalled();
  });
});

describe("runReviewSyncCycle (ADR 0089 §5)", () => {
  it("pulls book reviews and removals from each review relay since the watermark, the index under include:spam", async () => {
    const pull = vi.fn<Pull>(async () => []);
    await runReviewSyncCycle({
      librarian: LIB,
      since: 1_000,
      now: 2_000,
      pull,
      verify: () => true,
      writeLocal: async () => ({ ok: true as const, id: "x" }),
      readLocal: async () => [],
      push: async () => [],
    });
    const filters = pull.mock.calls.map((c) => [c[0], c[1]]);
    expect(filters).toContainEqual([
      "wss://search.brainstorm.world",
      { kinds: [34259], "#m": ["book"], since: 1_000, search: "include:spam" },
    ]);
    expect(filters).toContainEqual([
      "wss://search.brainstorm.world",
      { kinds: [5], "#k": ["34259"], since: 1_000, search: "include:spam" },
    ]);
    expect(filters).toContainEqual(["wss://nos.lol", { kinds: [34259], "#m": ["book"], since: 1_000 }]);
  });

  it("writes only signature-checked reviews of catalog books, and removals of book reviews", async () => {
    const good = ev({ id: "1".repeat(64) });
    const forged = ev({ id: "2".repeat(64) });
    const elsewhere = ev({ id: "3".repeat(64), tags: [["d", "book:30040:" + A + ":pg1"], ["a", "30040:" + A + ":pg1"], ["m", "book"]] });
    const rem = ev({ id: "4".repeat(64), kind: 5, tags: [["a", `34259:${A}:book:${BOOK}`], ["k", "34259"]] });
    const writeLocal = vi.fn<(e: SignedNostrEvent) => Promise<{ ok: true; id: string }>>(async () => ({ ok: true as const, id: "x" }));
    await runReviewSyncCycle({
      librarian: LIB,
      since: 0,
      now: 2_000_000_000,
      pull: async (_url: string, f: NostrFilter) => (f.kinds?.includes(5) ? [rem] : [good, forged, elsewhere]) as never,
      verify: (e: { id: string }) => e.id !== forged.id,
      writeLocal,
      readLocal: async () => [],
      push: async () => [],
    });
    const written = new Set(writeLocal.mock.calls.map((c) => c[0].id));
    expect(written).toEqual(new Set([good.id, rem.id]));
  });

  it("re-sends Unbnd's reviews and removals from the last two days to the index", async () => {
    const readLocal = vi.fn<Q>(async () => [ev({})] as never);
    const push = vi.fn<Fanout>(async () => []);
    await runReviewSyncCycle({
      librarian: LIB,
      since: 0,
      now: 1_790_000_000,
      pull: async () => [],
      verify: () => true,
      writeLocal: async () => ({ ok: true as const, id: "x" }),
      readLocal,
      push,
    });
    expect(readLocal.mock.calls[0]![0]).toEqual({ kinds: [34259, 5], since: 1_790_000_000 - 2 * 86_400 });
    expect(push.mock.calls[0]![0]).toEqual(["wss://search.brainstorm.world"]);
  });
});
