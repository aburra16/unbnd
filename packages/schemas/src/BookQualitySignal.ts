import type {
  DListAddress,
  HexPubkey,
  UnsignedDListEvent,
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
  _bookSlug: string,
  _signalSlug: string,
  _taggerPubkey: HexPubkey,
): string {
  throw new Error("buildBookQualitySignalDTag not implemented");
}

export function toBookQualitySignalEvent(
  _signal: BookQualitySignal,
): BookQualitySignalEvent {
  throw new Error("toBookQualitySignalEvent not implemented");
}

export function fromBookQualitySignalEvent(
  _event: BookQualitySignalEvent,
): BookQualitySignal {
  throw new Error("fromBookQualitySignalEvent not implemented");
}
