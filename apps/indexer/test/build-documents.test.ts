import { describe, expect, it } from "vitest";
import { finalizeEvent, generateSecretKey, getPublicKey } from "nostr-tools/pure";
import {
  asHexPubkey,
  buildBookRecordsHeaderAddress,
  buildBookTagsHeaderAddress,
  buildBookTagAssertionsHeaderAddress,
  toBookRecordEvent,
  toBookTagEvent,
  toBookTagAssertionEvent,
  toWireTemplate,
  type BookRecord,
  type SignedNostrEvent,
} from "@unbnd/schemas";
import { buildSearchDocuments } from "../src/build-documents";

const LIB = asHexPubkey("1".repeat(63) + "a");
const BOOKS = buildBookRecordsHeaderAddress(LIB);
const TAGS = buildBookTagsHeaderAddress(LIB);
const ASSERTS = buildBookTagAssertionsHeaderAddress(LIB);

function bookEvent(slug: string, title: string): SignedNostrEvent {
  const rec: BookRecord = {
    slug, title, authorName: `Author of ${title}`, format: "reference",
    source: "openlibrary", parentHeader: BOOKS, subjects: ["fiction"], publishYear: 2000,
  };
  const t = toWireTemplate(toBookRecordEvent(rec), 1);
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

function taxEvent(slug: string, type: "genre" | "style" | "signal", sensitivity: "normal" | "accusatory") {
  const t = toWireTemplate(
    toBookTagEvent({ slug, type, name: slug.replace(/-/g, " "), sensitivity, parentHeader: TAGS }),
    1,
  );
  return { id: slug, pubkey: LIB, sig: "x", ...t } as SignedNostrEvent;
}

function assertionEvent(sk: Uint8Array, bookSlug: string, tagSlug: string, tagType: "genre" | "style" | "signal", polarity: 1 | -1) {
  const a = {
    bookSlug, bookAddress: { kind: 39999 as const, pubkey: LIB, dTag: bookSlug },
    tagSlug, tagType, polarity, asserterPubkey: asHexPubkey(getPublicKey(sk)), parentHeader: ASSERTS,
  };
  const t = toWireTemplate(toBookTagAssertionEvent(a), 2);
  return JSON.parse(JSON.stringify(finalizeEvent(t as never, sk))) as SignedNostrEvent;
}

describe("buildSearchDocuments", () => {
  it("maps a book and attaches net-positive non-accusatory tags + genre slugs", () => {
    const sk = generateSecretKey();
    const docs = buildSearchDocuments(
      [bookEvent("b1", "Alpha")],
      [taxEvent("mystery", "genre", "normal"), taxEvent("ai-generated", "signal", "accusatory")],
      [
        assertionEvent(sk, "b1", "mystery", "genre", 1),
        assertionEvent(generateSecretKey(), "b1", "ai-generated", "signal", 1),
      ],
    );
    expect(docs).toHaveLength(1);
    const d = docs[0]!;
    expect(d.id).toBe("b1");
    expect(d.title).toBe("Alpha");
    expect(d.tags).toContain("mystery");
    expect(d.tags).not.toContain("ai-generated"); // accusatory excluded
    expect(d.genreSlugs).toEqual(["mystery"]);
  });

  it("drops a tag whose disputes cancel its applies (net <= 0)", () => {
    const docs = buildSearchDocuments(
      [bookEvent("b1", "Alpha")],
      [taxEvent("mystery", "genre", "normal")],
      [
        assertionEvent(generateSecretKey(), "b1", "mystery", "genre", 1),
        assertionEvent(generateSecretKey(), "b1", "mystery", "genre", -1),
      ],
    );
    expect(docs[0]!.tags).not.toContain("mystery");
    expect(docs[0]!.genreSlugs).toEqual([]);
  });

  it("a book with no assertions still indexes (empty tags)", () => {
    const docs = buildSearchDocuments([bookEvent("b2", "Beta")], [], []);
    expect(docs[0]).toMatchObject({ id: "b2", tags: [], genreSlugs: [] });
  });
});
