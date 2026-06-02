// Pure builder for the reveal job (Story 33 / ADR 0034 §4). Constructs the
// AccusatoryReveal under the librarian's `accusatory-reveals` header, identity
// (book, tag). No key, no relay, no LIBRARIAN_NSEC — signing happens in the
// cycle. Mirrors apps/promoter/src/build.ts.
import {
  buildBookAccusatoryRevealsHeaderAddress,
  type AccusatoryReveal,
  type HexPubkey,
  type RevealState,
} from "@unbnd/schemas";

export type RevealBuildInput = {
  readonly librarianPubkey: HexPubkey;
  readonly bookSlug: string;
  readonly tagSlug: string;
  readonly state: RevealState;
};

export function buildAccusatoryRevealEvent(
  input: RevealBuildInput,
): AccusatoryReveal {
  return {
    bookSlug: input.bookSlug,
    bookAddress: {
      kind: 39999,
      pubkey: input.librarianPubkey,
      dTag: input.bookSlug,
    },
    tagSlug: input.tagSlug,
    state: input.state,
    parentHeader: buildBookAccusatoryRevealsHeaderAddress(input.librarianPubkey),
  };
}
