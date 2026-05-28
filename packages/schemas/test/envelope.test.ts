import { describe, expect, expectTypeOf, it } from "vitest";
import {
  asEventId,
  asHexPubkey,
  formatAddress,
  parseAddress,
  parseAddressOfKind,
  type DListAddress,
  type EventId,
  type HexPubkey,
  type UnsignedDListEvent,
  type WordEnvelope,
} from "../src/envelope";

const VALID_HEX_64 =
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84";

describe("HexPubkey branding", () => {
  it("accepts a 64-character lowercase hex string", () => {
    const pk = asHexPubkey(VALID_HEX_64);
    expect(pk).toBe(VALID_HEX_64);
    expectTypeOf(pk).toEqualTypeOf<HexPubkey>();
  });

  it("rejects a string that is not 64 hex characters", () => {
    expect(() => asHexPubkey("not-hex")).toThrow();
    expect(() => asHexPubkey(VALID_HEX_64.slice(0, 63))).toThrow();
  });

  it("rejects uppercase hex", () => {
    expect(() => asHexPubkey(VALID_HEX_64.toUpperCase())).toThrow();
  });
});

describe("EventId branding", () => {
  it("accepts a 64-character lowercase hex string", () => {
    const id = asEventId(VALID_HEX_64);
    expect(id).toBe(VALID_HEX_64);
    expectTypeOf(id).toEqualTypeOf<EventId>();
  });

  it("rejects malformed event ids", () => {
    expect(() => asEventId("nope")).toThrow();
  });
});

describe("DListAddress format / parse", () => {
  const sampleAddr: DListAddress<39999> = {
    kind: 39999,
    pubkey: asHexPubkey(VALID_HEX_64),
    dTag: "the-great-gatsby",
  };

  it("formats an address as kind:pubkey:dTag", () => {
    const s = formatAddress(sampleAddr);
    expect(s).toBe(`39999:${VALID_HEX_64}:the-great-gatsby`);
  });

  it("parses a well-formed address string", () => {
    const a = parseAddress(`39999:${VALID_HEX_64}:the-great-gatsby`);
    expect(a.kind).toBe(39999);
    expect(a.pubkey).toBe(VALID_HEX_64);
    expect(a.dTag).toBe("the-great-gatsby");
  });

  it("round-trips: format then parse yields the same fields", () => {
    const s = formatAddress(sampleAddr);
    const back = parseAddress(s);
    expect(back).toEqual(sampleAddr);
  });

  it("parseAddressOfKind narrows the type to the expected kind", () => {
    const a = parseAddressOfKind(
      `39998:${VALID_HEX_64}:books`,
      39998,
    );
    expect(a.kind).toBe(39998);
    expectTypeOf(a).toEqualTypeOf<DListAddress<39998>>();
  });

  it("parseAddressOfKind throws when the kind does not match", () => {
    expect(() =>
      parseAddressOfKind(`39999:${VALID_HEX_64}:books`, 39998),
    ).toThrow();
  });

  it("parseAddress rejects malformed input", () => {
    expect(() => parseAddress("not-an-address")).toThrow();
    expect(() => parseAddress("39999::dtag")).toThrow();
    expect(() => parseAddress(`abc:${VALID_HEX_64}:dtag`)).toThrow();
  });
});

describe("WordEnvelope and UnsignedDListEvent shapes", () => {
  it("WordEnvelope discriminator narrows by wordType", () => {
    const ratingEnv: WordEnvelope<"bookRating"> = {
      word: {
        slug: "rating--the-great-gatsby--9bf2eed5",
        name: "rating: The Great Gatsby",
        title: "Rating: The Great Gatsby",
        wordTypes: ["word", "bookRating"],
      },
    };
    expectTypeOf(ratingEnv.word.wordTypes[1]).toEqualTypeOf<"bookRating">();
  });

  it("UnsignedDListEvent carries a structured parentHeader of kind 39998", () => {
    type SampleEvent = UnsignedDListEvent<39999, "bookRating">;
    type ParentHeaderKind = SampleEvent["parentHeader"]["kind"];
    expectTypeOf<ParentHeaderKind>().toEqualTypeOf<39998>();
  });
});
