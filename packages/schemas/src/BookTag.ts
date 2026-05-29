// Tag taxonomy element (ADR 0009): a recognized tag the UI offers — a genre,
// style, or quality signal — with a sensitivity class. Kind-39999 item z-tagged
// to the `book-tags` concept header.
import { formatAddress, type DListAddress, type UnsignedDListEvent } from "./envelope";

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
export function buildBookTagDTag(type: TagType, slug: string): string {
  return `tag--${type}--${slug}`;
}

export function toBookTagEvent(tag: BookTag): BookTagEvent {
  const dTag = buildBookTagDTag(tag.type, tag.slug);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(tag.parentHeader)],
    ["t", tag.slug],
    ["t", tag.type],
    ["sensitivity", tag.sensitivity],
  ];
  const payload: BookTagPayload = {
    word: { slug: dTag, name: tag.name, title: tag.name, wordTypes: ["word", "bookTag"] },
    bookTag: {
      slug: tag.slug,
      type: tag.type,
      name: tag.name,
      sensitivity: tag.sensitivity,
    },
  };
  return { kind: BOOK_TAG_KIND, tags, content: "", payload, parentHeader: tag.parentHeader };
}

export function fromBookTagEvent(event: BookTagEvent): BookTag {
  const p = event.payload.bookTag;
  return {
    slug: p.slug,
    type: p.type,
    name: p.name,
    sensitivity: p.sensitivity,
    parentHeader: event.parentHeader,
  };
}
