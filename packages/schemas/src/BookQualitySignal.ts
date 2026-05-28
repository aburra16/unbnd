import {
  asHexPubkey,
  formatAddress,
  parseAddressOfKind,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
} from "./envelope";

export const BOOK_QUALITY_SIGNAL_KIND = 39999 as const;
export const BOOK_QUALITY_SIGNAL_WORD_TYPE = "bookQualitySignal" as const;

/**
 * Domain type — what the UI consumes.
 *
 * Mirrors PRD §6.6. `signalSlug` is an open string; the application
 * taxonomy ("ai-generated", "well-edited", "original-voice",
 * "needs-copy-edit") is enforced by UI choice, not by the type system.
 */
export type BookQualitySignal = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly signalSlug: string;
  readonly taggerPubkey: HexPubkey;
  readonly parentHeader: DListAddress<39998>;
};

export type BookQualitySignalPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookQualitySignal", ...string[]];
  };
  readonly bookQualitySignal: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly signalSlug: string;
  };
};

export type BookQualitySignalEvent = UnsignedDListEvent<
  39999,
  "bookQualitySignal",
  BookQualitySignalPayload["bookQualitySignal"]
>;

/**
 * D-tag pattern: `quality-signal--<bookSlug>--<signalSlug>--<taggerPubkey.slice(0,8)>`.
 * Composite identity (tagger, book, signal); re-publishing overwrites.
 */
export function buildBookQualitySignalDTag(
  bookSlug: string,
  signalSlug: string,
  taggerPubkey: HexPubkey,
): string {
  return `quality-signal--${bookSlug}--${signalSlug}--${pubkeyPrefix(taggerPubkey)}`;
}

export function toBookQualitySignalEvent(
  signal: BookQualitySignal,
): BookQualitySignalEvent {
  const dTag = buildBookQualitySignalDTag(
    signal.bookSlug,
    signal.signalSlug,
    signal.taggerPubkey,
  );
  const bookAtag = formatAddress(signal.bookAddress);

  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(signal.parentHeader)],
    ["t", signal.bookSlug],
    ["t", signal.signalSlug],
    ["a", bookAtag],
    ["p", signal.taggerPubkey],
  ];

  const payload: BookQualitySignalPayload = {
    word: {
      slug: dTag,
      name: `quality signal: ${signal.bookSlug} → ${signal.signalSlug}`,
      title: `Quality signal: ${signal.bookSlug} → ${signal.signalSlug}`,
      wordTypes: ["word", "bookQualitySignal"],
    },
    bookQualitySignal: {
      bookSlug: signal.bookSlug,
      bookAtag,
      signalSlug: signal.signalSlug,
    },
  };

  return {
    kind: BOOK_QUALITY_SIGNAL_KIND,
    tags,
    content: "",
    payload,
    parentHeader: signal.parentHeader,
  };
}

export function fromBookQualitySignalEvent(
  event: BookQualitySignalEvent,
): BookQualitySignal {
  const p = event.payload.bookQualitySignal;
  const taggerTag = event.tags.find((t) => t[0] === "p");
  if (!taggerTag || taggerTag.length < 2) {
    throw new Error(
      "fromBookQualitySignalEvent: missing `p` tag carrying the tagger pubkey",
    );
  }
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    signalSlug: p.signalSlug,
    taggerPubkey: asHexPubkey(taggerTag[1]!),
    parentHeader: event.parentHeader,
  };
}
