// FAILING TESTS — Story 108 / ADR 0096 §2: catalog records in pages, each page
// with only its own books' tag assertions.
import { describe, expect, it, vi } from "vitest";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  formatAddress,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { forEachCatalogPage } from "../src";
import { buildBookAssertionEventsForTest } from "./_tag-fixtures";

const LIB = asHexPubkey("1".repeat(63) + "a");
const BOOKS_Z = formatAddress(buildBookRecordsHeaderAddress(LIB));
const ASSERT_Z = formatAddress(buildBookTagAssertionsHeaderAddress(LIB));

const record = (slug: string, at: number) =>
  ({ id: `${slug}`.padEnd(64, "0"), pubkey: LIB, kind: 39999, created_at: at, content: "", sig: "s", tags: [["d", slug], ["z", BOOKS_Z]] }) as SignedNostrEvent;

function relay(events: SignedNostrEvent[]) {
  return vi.fn(async (f: Record<string, unknown>) =>
    events.filter((e) => {
      const tag = (name: string) => e.tags.filter((t) => t[0] === name).map((t) => t[1]);
      if (f.kinds && !(f.kinds as number[]).includes(e.kind)) return false;
      if (f.authors && !(f.authors as string[]).includes(e.pubkey)) return false;
      if (f["#z"] && !(f["#z"] as string[]).some((z) => tag("z").includes(z))) return false;
      if (f["#a"] && !(f["#a"] as string[]).some((a) => tag("a").includes(a))) return false;
      if (f.until !== undefined && e.created_at > (f.until as number)) return false;
      return true;
    }).sort((a, b) => b.created_at - a.created_at).slice(0, Math.min((f.limit as number) ?? 500, 500)),
  );
}

describe("forEachCatalogPage", () => {
  it("hands on each page of records with only those books' assertions, grouped by slug", async () => {
    const books = [record("b1", 30), record("b2", 20), record("b3", 10)];
    const assertions = [
      ...buildBookAssertionEventsForTest("b1", [["a".repeat(64), "fantasy", 1]]),
      ...buildBookAssertionEventsForTest("b3", [["a".repeat(64), "mystery", 1], ["b".repeat(64), "mystery", 1]]),
    ];
    const query = relay([...books, ...assertions]);
    const seen: Array<{ slugs: string[]; assertions: Record<string, number> }> = [];
    await forEachCatalogPage({
      query,
      librarian: LIB,
      pageSize: 2,
      onPage: async (records, bySlug) => {
        seen.push({
          slugs: records.map((r) => r.tags.find((t) => t[0] === "d")![1]!),
          assertions: Object.fromEntries([...bySlug].map(([k, v]) => [k, v.length])),
        });
      },
    });
    expect(seen).toEqual([
      { slugs: ["b1", "b2"], assertions: { b1: 1 } },
      { slugs: ["b3"], assertions: { b3: 2 } },
    ]);
    const assertionReads = query.mock.calls.map((c) => c[0]).filter((f) => (f["#z"] as string[])[0] === ASSERT_Z);
    expect(assertionReads.every((f) => (f["#a"] as string[]).length <= 250)).toBe(true);
  });

  it("reads only the librarian's records", async () => {
    const query = relay([record("mine", 10), { ...record("theirs", 20), pubkey: "c".repeat(64) } as SignedNostrEvent]);
    const slugs: string[] = [];
    await forEachCatalogPage({ query, librarian: LIB, pageSize: 10, onPage: async (rs) => { slugs.push(...rs.map((r) => r.tags[0]![1]!)); } });
    expect(slugs).toEqual(["mine"]);
  });

  it("pages each assertion read past the relay's 500-event cap (review round 1)", async () => {
    const books = [record("b1", 9_999)];
    const many = Array.from({ length: 700 }, (_, i) =>
      buildBookAssertionEventsForTest("b1", [[i.toString(16).padStart(64, "0"), "fantasy", 1, 1_700_000_000 + i]])[0]!,
    );
    const query = relay([...books, ...many]);
    let count = 0;
    await forEachCatalogPage({ query, librarian: LIB, onPage: async (_r, bySlug) => { count = bySlug.get("b1")?.length ?? 0; } });
    expect(count).toBe(700);
  });
});
