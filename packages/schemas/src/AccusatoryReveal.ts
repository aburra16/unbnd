// Accusatory-tag reveal (Story 33 / ADR 0034 §3): a LIBRARIAN-signed kind-39999
// addressable/replaceable event that reveals (or withdraws) a single accusatory
// tag on a single book at read time. Identity is (book, tag): the d-tag is
// `reveal--<bookSlug>--<tagSlug>`, so a `withdrawn` event REPLACES the
// `revealed` one at the SAME address (reversible by replace, no separate
// tombstone kind — AC-6). It `#a`-targets the book (filter), `#t`-targets the
// tag slug (filter), carries `["state","revealed"|"withdrawn"]`, and z-tags to
// the `accusatory-reveals` concept header. content is "". Author = the librarian
// (the only signer; attribution is the signature itself). Mirrors
// AuthorVerifiedAssertion.ts.
import {
  formatAddress,
  parseAddressOfKind,
  type DListAddress,
  type UnsignedDListEvent,
} from "./envelope";

export const ACCUSATORY_REVEAL_KIND = 39999 as const;
export const ACCUSATORY_REVEAL_WORD_TYPE = "accusatoryReveal" as const;

/** A reveal surfaces the tag at read time; a withdraw hides it again. */
export type RevealState = "revealed" | "withdrawn";

export type AccusatoryReveal = {
  readonly bookSlug: string;
  readonly bookAddress: DListAddress<39999>;
  readonly tagSlug: string;
  readonly state: RevealState;
  readonly parentHeader: DListAddress<39998>;
};

export type AccusatoryRevealPayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "accusatoryReveal", ...string[]];
  };
  readonly accusatoryReveal: {
    readonly bookSlug: string;
    readonly bookAtag: string;
    readonly tagSlug: string;
    readonly state: RevealState;
  };
};

export type AccusatoryRevealEvent = UnsignedDListEvent<
  39999,
  "accusatoryReveal",
  AccusatoryRevealPayload["accusatoryReveal"]
>;

/** D-tag: `reveal--<bookSlug>--<tagSlug>`; identity (book, tag), NOT the actor. */
export function buildAccusatoryRevealDTag(
  bookSlug: string,
  tagSlug: string,
): string {
  return `reveal--${bookSlug}--${tagSlug}`;
}

export function toAccusatoryRevealEvent(
  reveal: AccusatoryReveal,
): AccusatoryRevealEvent {
  const dTag = buildAccusatoryRevealDTag(reveal.bookSlug, reveal.tagSlug);
  const bookAtag = formatAddress(reveal.bookAddress);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(reveal.parentHeader)],
    ["a", bookAtag],
    ["t", reveal.tagSlug],
    ["state", reveal.state],
  ];
  const payload: AccusatoryRevealPayload = {
    word: {
      slug: dTag,
      name: `reveal: ${reveal.bookSlug} → ${reveal.tagSlug}`,
      title: `Reveal: ${reveal.bookSlug} → ${reveal.tagSlug}`,
      wordTypes: ["word", "accusatoryReveal"],
    },
    accusatoryReveal: {
      bookSlug: reveal.bookSlug,
      bookAtag,
      tagSlug: reveal.tagSlug,
      state: reveal.state,
    },
  };
  return {
    kind: ACCUSATORY_REVEAL_KIND,
    tags,
    content: "",
    payload,
    parentHeader: reveal.parentHeader,
  };
}

export function fromAccusatoryRevealEvent(
  event: AccusatoryRevealEvent,
): AccusatoryReveal {
  const p = event.payload.accusatoryReveal;
  return {
    bookSlug: p.bookSlug,
    bookAddress: parseAddressOfKind(p.bookAtag, 39999),
    tagSlug: p.tagSlug,
    state: p.state,
    parentHeader: event.parentHeader,
  };
}
