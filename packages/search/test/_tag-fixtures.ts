// Tag and assertion events for the search package's tests (Story 105).
import {
  buildBookTagAssertionsHeaderAddress,
  buildBookTagsHeaderAddress,
  toBookTagAssertionEvent,
  toBookTagEvent,
  toWireTemplate,
  asHexPubkey,
  type SignedNostrEvent,
  type TagSensitivity,
  type TagType,
} from "@unbnd/schemas";

const LIB = asHexPubkey("1".repeat(63) + "a");
let seq = 0;

function signed(template: { kind: number; created_at: number; tags: string[][]; content: string }, pubkey: string): SignedNostrEvent {
  seq++;
  return { ...template, id: seq.toString(16).padStart(64, "0"), pubkey, sig: "f".repeat(128) } as SignedNostrEvent;
}

export function buildBookTagEventForTest(slug: string, type: TagType, name: string, sensitivity: TagSensitivity): SignedNostrEvent {
  const ev = toBookTagEvent({ slug, type, name, sensitivity, parentHeader: buildBookTagsHeaderAddress(LIB) });
  return signed(toWireTemplate(ev as never, 1_700_000_000), LIB);
}

export function buildBookAssertionEventsForTest(
  bookSlug: string,
  rows: ReadonlyArray<readonly [string, string, 1 | -1, number?]>,
): SignedNostrEvent[] {
  return rows.map(([who, tagSlug, polarity, at]) => {
    const ev = toBookTagAssertionEvent({
      bookSlug,
      bookAddress: { kind: 39999, pubkey: LIB, dTag: bookSlug },
      tagSlug,
      tagType: "genre",
      polarity,
      asserterPubkey: asHexPubkey(who),
      parentHeader: buildBookTagAssertionsHeaderAddress(LIB),
    } as never);
    return signed(toWireTemplate(ev as never, at ?? 1_700_000_100), who);
  });
}
