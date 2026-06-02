// FAILING TESTS (red) — Story 33 / ADR 0034 §4. The reveal job's PURE builder
// `buildAccusatoryRevealEvent({ librarianPubkey, bookSlug, tagSlug, state })` →
// a kind-39999 AccusatoryReveal under the librarian's `accusatory-reveals`
// header, #a-targeting the book, #t-targeting the tag, carrying `state`, with the
// slug-deterministic d-tag `reveal--<book>--<tag>`. Pure: no key, no relay, no
// LIBRARIAN_NSEC — signing happens in the cycle.
//
// RED until apps/promoter/src/reveal/build.ts exists.
import { describe, expect, it } from "vitest";
import {
  asHexPubkey,
  toAccusatoryRevealEvent,
  type AccusatoryReveal,
} from "@unbnd/schemas";
import { buildAccusatoryRevealEvent } from "../src/reveal/build";

const LIB = asHexPubkey("1".repeat(63) + "a");

describe("buildAccusatoryRevealEvent — pure builder (AC-4)", () => {
  it("builds a reveal under the librarian's accusatory-reveals header, #a book, #t tag, state, d-tag", () => {
    const reveal = buildAccusatoryRevealEvent({
      librarianPubkey: LIB,
      bookSlug: "ol-ol45804w",
      tagSlug: "ai-generated",
      state: "revealed",
    }) as AccusatoryReveal;
    expect(reveal.parentHeader).toEqual({ kind: 39998, pubkey: LIB, dTag: "accusatory-reveals" });

    const event = toAccusatoryRevealEvent(reveal);
    expect(event.kind).toBe(39999);
    expect(event.tags).toContainEqual(["d", "reveal--ol-ol45804w--ai-generated"]);
    expect(event.tags).toContainEqual(["z", `39998:${LIB}:accusatory-reveals`]);
    expect(event.tags).toContainEqual(["a", `39999:${LIB}:ol-ol45804w`]);
    expect(event.tags).toContainEqual(["t", "ai-generated"]);
    expect(event.tags).toContainEqual(["state", "revealed"]);
  });

  it("builds a withdraw at the SAME address with state `withdrawn`", () => {
    const reveal = buildAccusatoryRevealEvent({
      librarianPubkey: LIB,
      bookSlug: "ol-ol45804w",
      tagSlug: "ai-generated",
      state: "withdrawn",
    }) as AccusatoryReveal;
    const event = toAccusatoryRevealEvent(reveal);
    expect(event.tags).toContainEqual(["state", "withdrawn"]);
    expect(event.tags).toContainEqual(["d", "reveal--ol-ol45804w--ai-generated"]);
  });

  it("is pure: contains no LIBRARIAN_NSEC / signing (the builder takes only the public pubkey)", () => {
    const reveal = buildAccusatoryRevealEvent({
      librarianPubkey: LIB,
      bookSlug: "b1",
      tagSlug: "possibly-ai-generated",
      state: "revealed",
    }) as AccusatoryReveal;
    expect(reveal.bookSlug).toBe("b1");
    expect(reveal.tagSlug).toBe("possibly-ai-generated");
    expect(reveal.state).toBe("revealed");
  });
});
