import { describe, expect, it } from "vitest";
import { generateSecretKey } from "nostr-tools/pure";
import type { Config } from "../../src/config";
import type { SignedNostrEvent } from "@unbnd/schemas";
import type { NostrFilter } from "../../src/nostr/query";
import {
  buildRemovalTemplateFor,
  buildReviewTemplateFor,
  currentReview,
  RatingError,
} from "../../src/ratings/template";
import { LIBRARIAN, bookAddress, signedRating, signedRemoval } from "./_fixtures";

const baseConfig: Config = {
  port: 8787,
  strfryUrl: "ws://localhost:7777",
  neo4jBoltUrl: "bolt://localhost:7687",
  neo4jUser: "neo4j",
  neo4jPassword: "x",
  tapestryApiUrl: "http://localhost:8080",
  searchUrl: "http://localhost:7700",
  searchApiKey: "x",
  searchProvider: "meili",
  trustProvider: "brainstorm",
  databaseUrl: "postgres://x:x@localhost:5432/x",
  backupEncryptionKey: "a".repeat(64),
  publicOrigin: "http://localhost:5181",
  librarianPubkey: LIBRARIAN,
};

// Story 99 / ADR 0089 §4: templates built on the person's current review.
const NOW = 1_790_000_000;
const BOOK = {
  id: "b".repeat(64),
  pubkey: LIBRARIAN,
  kind: 39999,
  created_at: 1,
  tags: [["d", "orbital"], ["title", "Orbital"]],
  content: "",
  sig: "f".repeat(128),
} as unknown as SignedNostrEvent;

/** A relay holding the book and the given events, answering by kind/author/#d/#a. */
function relay(events: SignedNostrEvent[]) {
  return async (f: NostrFilter): Promise<SignedNostrEvent[]> => {
    if (f.kinds?.includes(39999)) return f["#d"]?.includes("orbital") ? [BOOK] : [];
    return events.filter(
      (e) =>
        f.kinds?.includes(e.kind) &&
        (!f.authors || f.authors.includes(e.pubkey)) &&
        (!f["#d"] || e.tags.some((t) => t[0] === "d" && f["#d"]!.includes(t[1]!))) &&
        (!f["#a"] || e.tags.some((t) => t[0] === "a" && f["#a"]!.includes(t[1]!))),
    );
  };
}

describe("buildReviewTemplateFor", () => {
  it("a first review: the shared record, titled from the catalog, dated now", async () => {
    const sk = generateSecretKey();
    const me = signedRating({ sk }).pubkey;
    const t = await buildReviewTemplateFor(baseConfig, relay([]), { pubkey: me, bookSlug: "orbital", score: 4, reviewText: " Good. " }, NOW);
    expect(t.kind).toBe(34259);
    expect(t.created_at).toBe(NOW);
    expect(t.content).toBe("Good.");
    expect(t.tags).toContainEqual(["d", `book:${bookAddress("orbital")}`]);
    expect(t.tags).toContainEqual(["alt", "Review of Orbital: 4 of 5 stars"]);
  });

  it("an edit builds on the current review: other apps' tags kept, dated after it", async () => {
    const sk = generateSecretKey();
    const prev = signedRating({ sk, score: 2, createdAt: NOW + 30 });
    const withExtra = { ...prev.event, tags: [...prev.event.tags, ["x-other", "1"]] };
    // A hand-extended event no longer verifies, but the template step only reads it.
    const t = await buildReviewTemplateFor(
      baseConfig,
      relay([withExtra as SignedNostrEvent]),
      { pubkey: prev.pubkey, bookSlug: "orbital", score: 5 },
      NOW,
    );
    expect(t.created_at).toBe(NOW + 31);
    expect(t.tags).toContainEqual(["x-other", "1"]);
    expect(t.tags).toContainEqual(["s", "5"]);
  });

  it("after a removal, a new review is dated past it", async () => {
    const sk = generateSecretKey();
    const r = signedRating({ sk, createdAt: NOW - 100 });
    const gone = signedRemoval({ sk, reviewId: r.event.id, createdAt: NOW + 60 });
    const t = await buildReviewTemplateFor(
      baseConfig,
      relay([r.event, gone.event] as SignedNostrEvent[]),
      { pubkey: r.pubkey, bookSlug: "orbital", score: 3 },
      NOW,
    );
    expect(t.created_at).toBe(NOW + 61);
    expect(t.tags.some((x) => x[0] === "x-other")).toBe(false);
  });

  it("refuses a book outside the catalog, bad stars, long words, and a missing librarian", async () => {
    const me = "a".repeat(64);
    const call = (over: Record<string, unknown>, config: Config = baseConfig) =>
      buildReviewTemplateFor(config, relay([]), { pubkey: me, bookSlug: "orbital", score: 4, ...over }, NOW);
    await expect(call({ bookSlug: "nope" })).rejects.toMatchObject({ code: "invalid_book" });
    await expect(call({ score: 6 })).rejects.toMatchObject({ code: "score_out_of_range" });
    await expect(call({ score: 4.5 })).rejects.toMatchObject({ code: "score_out_of_range" });
    await expect(call({ reviewText: "x".repeat(1201) })).rejects.toMatchObject({ code: "words_too_long" });
    await expect(call({}, { ...baseConfig, librarianPubkey: undefined })).rejects.toBeInstanceOf(RatingError);
  });
});

describe("currentReview and buildRemovalTemplateFor", () => {
  it("finds the person's standing review and removes it by id and address, dated no earlier than it", async () => {
    const sk = generateSecretKey();
    const r = signedRating({ sk, createdAt: NOW + 50 });
    const { standing } = await currentReview(baseConfig, relay([r.event as SignedNostrEvent]), r.pubkey, bookAddress("orbital"));
    expect(standing?.id).toBe(r.event.id);
    const t = buildRemovalTemplateFor(standing!, r.pubkey, NOW);
    expect(t.kind).toBe(5);
    expect(t.created_at).toBe(NOW + 50);
    expect(t.tags).toEqual([
      ["e", r.event.id],
      ["a", `34259:${r.pubkey}:book:${bookAddress("orbital")}`],
      ["k", "34259"],
    ]);
  });
});
