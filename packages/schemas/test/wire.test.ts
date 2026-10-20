// The generic wire bridge (toWireTemplate / fromWireEvent) over a real list
// record. The sample is a tag assertion since Story 99 retired the old rating
// record (book reviews are kind 34259 and do not use the bridge).
import { describe, expect, it } from "vitest";
import { toWireTemplate, fromWireEvent } from "../src/wire";
import {
  fromBookTagAssertionEvent,
  toBookTagAssertionEvent,
  type BookTagAssertion,
} from "../src/BookTagAssertion";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const ASSERTER = hex64("9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84");
const ASSERTIONS_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "book-tag-assertions",
};

const sample: BookTagAssertion = {
  bookSlug: "orbital",
  bookAddress: { kind: 39999, pubkey: LIBRARIAN, dTag: "orbital" },
  tagSlug: "science-fiction",
  tagType: "genre",
  polarity: 1,
  asserterPubkey: ASSERTER,
  parentHeader: ASSERTIONS_HEADER,
};

const CREATED_AT = 1_716_800_000;

describe("toWireTemplate", () => {
  it("carries kind, content, and the caller-supplied created_at", () => {
    const t = toWireTemplate(toBookTagAssertionEvent(sample), CREATED_AT);
    expect(t.kind).toBe(39999);
    expect(t.created_at).toBe(CREATED_AT);
    expect(t.content).toBe("");
  });

  it("appends a json tag carrying the serialized word-wrapper payload", () => {
    const t = toWireTemplate(toBookTagAssertionEvent(sample), CREATED_AT);
    const jsonTag = t.tags.find((tag) => tag[0] === "json");
    expect(jsonTag).toBeDefined();
    const parsed = JSON.parse(jsonTag![1]!);
    expect(parsed.word.wordTypes[0]).toBe("word");
  });

  it("preserves the named tags (d, z, a)", () => {
    const t = toWireTemplate(toBookTagAssertionEvent(sample), CREATED_AT);
    expect(t.tags.find((x) => x[0] === "d")?.[1]).toContain("orbital");
    expect(t.tags).toContainEqual(["z", `39998:${LIBRARIAN}:book-tag-assertions`]);
    expect(t.tags).toContainEqual(["a", `39999:${LIBRARIAN}:orbital`]);
  });

  it("does not add pubkey, id, or sig (the signer does that)", () => {
    const t = toWireTemplate(toBookTagAssertionEvent(sample), CREATED_AT) as Record<string, unknown>;
    expect(t.pubkey).toBeUndefined();
    expect(t.id).toBeUndefined();
    expect(t.sig).toBeUndefined();
  });
});

describe("fromWireEvent", () => {
  it("reconstructs the unsigned event so the domain record round-trips", () => {
    const wire = toWireTemplate(toBookTagAssertionEvent(sample), CREATED_AT);
    const back = fromWireEvent({ kind: wire.kind, content: wire.content, tags: wire.tags });
    expect(fromBookTagAssertionEvent(back as never)).toEqual(sample);
  });

  it("round-trips a dispute (polarity -1)", () => {
    const dispute: BookTagAssertion = { ...sample, polarity: -1 };
    const wire = toWireTemplate(toBookTagAssertionEvent(dispute), CREATED_AT);
    const back = fromWireEvent({ kind: wire.kind, content: wire.content, tags: wire.tags });
    expect(fromBookTagAssertionEvent(back as never)).toEqual(dispute);
  });

  it("throws when the json tag is missing", () => {
    expect(() => fromWireEvent({ kind: 39999, content: "", tags: [["d", "x"]] })).toThrow();
  });
});
