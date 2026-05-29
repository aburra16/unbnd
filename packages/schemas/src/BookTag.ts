// Tag taxonomy element (ADR 0009): a recognized tag the UI offers — a genre,
// style, or quality signal — with a sensitivity class. Kind-39999 item z-tagged
// to the `book-tags` concept header. IMPLEMENTATION PENDING (stubs throw).
import type { DListAddress, UnsignedDListEvent } from "./envelope";

export const BOOK_TAG_KIND = 39999 as const;
export const BOOK_TAG_WORD_TYPE = "bookTag" as const;

export type TagType = "genre" | "style" | "signal";
export type TagSensitivity = "normal" | "accusatory";

export type BookTag = {
  readonly slug: string;
  readonly type: TagType;
  readonly name: string;
  readonly sensitivity: TagSensitivity;
  readonly parentHeader: DListAddress<39998>;
};

export type BookTagPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "bookTag", ...string[]];
  };
  readonly bookTag: {
    readonly slug: string;
    readonly type: TagType;
    readonly name: string;
    readonly sensitivity: TagSensitivity;
  };
};

export type BookTagEvent = UnsignedDListEvent<39999, "bookTag", BookTagPayload["bookTag"]>;

/** D-tag: `tag--<type>--<slug>` — deterministic registry identity. */
export function buildBookTagDTag(_type: TagType, _slug: string): string {
  throw new Error("buildBookTagDTag not implemented");
}

export function toBookTagEvent(_tag: BookTag): BookTagEvent {
  throw new Error("toBookTagEvent not implemented");
}

export function fromBookTagEvent(_event: BookTagEvent): BookTag {
  throw new Error("fromBookTagEvent not implemented");
}
