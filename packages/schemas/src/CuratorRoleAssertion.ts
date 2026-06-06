// Curator-role assertion (Story 67 / ADR 0066): a trusted user's vouch that a
// PUBKEY holds a role (v1: "curator"). A kind-39999 item that carries the SUBJECT
// being vouched for in a `p` tag (the target — NOT the signer), the role in a `t`
// tag, an apply/dispute `polarity`, and z-tags to the NEW `curator-roles` concept
// header. Lives under a per-(asserter, subject) replaceable d-tag
// `curatorrole--<subject8>--<asserter8>`, so an asserter re-asserting / flipping
// polarity on the same subject replaces (idempotent). content is "". Mirrors
// AuthorVerifiedAssertion.ts, but the target is a pubkey, not a book (no `#a`).
import {
  asHexPubkey,
  formatAddress,
  pubkeyPrefix,
  type DListAddress,
  type HexPubkey,
  type UnsignedDListEvent,
} from "./envelope";
import type { Polarity } from "./BookTagAssertion";

export const CURATOR_ROLE_KIND = 39999 as const;
export const CURATOR_ROLE_WORD_TYPE = "curatorRole" as const;
/** The only role in v1. Reserved as a `t` tag so future roles reuse the shape. */
export const CURATOR_ROLE = "curator" as const;

export type CuratorRoleAssertion = {
  /** The candidate whose curator role is being vouched (the #p target, not the signer). */
  readonly subjectPubkey: HexPubkey;
  /** The trusted user asserting the role (the signer; carried into the d-tag). */
  readonly asserterPubkey: HexPubkey;
  readonly role: typeof CURATOR_ROLE;
  readonly polarity: Polarity;
  readonly parentHeader: DListAddress<39998>;
};

export type CuratorRolePayload = {
  readonly word: {
    readonly slug: string;
    readonly name: string;
    readonly title: string;
    readonly wordTypes: readonly ["word", "curatorRole", ...string[]];
  };
  readonly curatorRole: {
    readonly subjectPubkey: HexPubkey;
    readonly asserterPubkey: HexPubkey;
    readonly role: typeof CURATOR_ROLE;
    readonly polarity: Polarity;
  };
};

export type CuratorRoleEvent = UnsignedDListEvent<
  39999,
  "curatorRole",
  CuratorRolePayload["curatorRole"]
>;

/** D-tag: `curatorrole--<subject8>--<asserter8>`; identity (asserter, subject). */
export function buildCuratorRoleDTag(
  subjectPubkey: HexPubkey,
  asserterPubkey: HexPubkey,
): string {
  return `curatorrole--${pubkeyPrefix(subjectPubkey)}--${pubkeyPrefix(asserterPubkey)}`;
}

export function toCuratorRoleEvent(assertion: CuratorRoleAssertion): CuratorRoleEvent {
  const dTag = buildCuratorRoleDTag(assertion.subjectPubkey, assertion.asserterPubkey);
  const tags: Array<readonly [string, ...string[]]> = [
    ["d", dTag],
    ["z", formatAddress(assertion.parentHeader)],
    ["p", assertion.subjectPubkey],
    ["t", assertion.role],
    ["polarity", String(assertion.polarity)],
  ];
  const payload: CuratorRolePayload = {
    word: {
      slug: dTag,
      name: `role: ${assertion.role} → ${pubkeyPrefix(assertion.subjectPubkey)}`,
      title: `Role: ${assertion.role} → ${pubkeyPrefix(assertion.subjectPubkey)}`,
      wordTypes: ["word", "curatorRole"],
    },
    curatorRole: {
      subjectPubkey: assertion.subjectPubkey,
      asserterPubkey: assertion.asserterPubkey,
      role: assertion.role,
      polarity: assertion.polarity,
    },
  };
  return {
    kind: CURATOR_ROLE_KIND,
    tags,
    content: "",
    payload,
    parentHeader: assertion.parentHeader,
  };
}

export function fromCuratorRoleEvent(event: CuratorRoleEvent): CuratorRoleAssertion {
  const p = event.payload.curatorRole;
  const subjectTag = event.tags.find((t) => t[0] === "p");
  if (!subjectTag || subjectTag.length < 2) {
    throw new Error(
      "fromCuratorRoleEvent: missing `p` tag carrying the subject pubkey",
    );
  }
  return {
    subjectPubkey: asHexPubkey(subjectTag[1]!),
    asserterPubkey: asHexPubkey(p.asserterPubkey),
    role: p.role,
    polarity: p.polarity,
    parentHeader: event.parentHeader,
  };
}
