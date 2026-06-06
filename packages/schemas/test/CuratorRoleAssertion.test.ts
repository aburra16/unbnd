// Story 67 / ADR 0066 — the CuratorRoleAssertion schema (contract). A trusted
// user's kind-39999 vouch carrying the SUBJECT pubkey in `p` (the target, not the
// signer), the role in `t`, an apply/dispute `polarity`, z-tagged to the NEW
// `curator-roles` concept, under a per-(asserter, subject) replaceable d-tag
// `curatorrole--<subject8>--<asserter8>`. content "". Mirrors
// AuthorVerifiedAssertion.test.ts but the target is a pubkey, not a book (no #a).
import { describe, expect, it } from "vitest";
import {
  buildCuratorRoleDTag,
  fromCuratorRoleEvent,
  toCuratorRoleEvent,
  CURATOR_ROLE_KIND,
  CURATOR_ROLE,
  type CuratorRoleAssertion,
} from "../src/CuratorRoleAssertion";
import { buildCuratorRolesHeaderAddress } from "../src/concept-headers";
import type { DListAddress } from "../src/envelope";
import { hex64 } from "./_helpers";

const LIBRARIAN = hex64("1".repeat(63) + "a");
const SUBJECT = hex64(
  "9bf2eed5c7f783735c06e518f56efb96bbd9e3dbd962e2f56b4cb14caf105d84",
);
const ASSERTER = hex64("c".repeat(64));
const CURATOR_ROLES_HEADER: DListAddress<39998> = {
  kind: 39998,
  pubkey: LIBRARIAN,
  dTag: "curator-roles",
};

const apply: CuratorRoleAssertion = {
  subjectPubkey: SUBJECT,
  asserterPubkey: ASSERTER,
  role: CURATOR_ROLE,
  polarity: 1,
  parentHeader: CURATOR_ROLES_HEADER,
};

describe("CURATOR_ROLE_KIND", () => {
  it("is the kind-39999 DList item kind", () => {
    expect(CURATOR_ROLE_KIND).toBe(39999);
  });
});

describe("buildCuratorRolesHeaderAddress", () => {
  it("builds the NEW `curator-roles` concept header under the librarian", () => {
    expect(buildCuratorRolesHeaderAddress(LIBRARIAN)).toEqual({
      kind: 39998,
      pubkey: LIBRARIAN,
      dTag: "curator-roles",
    });
  });
});

describe("buildCuratorRoleDTag", () => {
  it("builds curatorrole--<subject8>--<asserter8> (identity = asserter + subject)", () => {
    expect(buildCuratorRoleDTag(SUBJECT, ASSERTER)).toBe(
      "curatorrole--9bf2eed5--cccccccc",
    );
  });

  it("differs by asserter (two asserters vouching one subject do not collide)", () => {
    const other = hex64("d".repeat(64));
    expect(buildCuratorRoleDTag(SUBJECT, ASSERTER)).not.toBe(
      buildCuratorRoleDTag(SUBJECT, other),
    );
  });

  it("differs by subject (one asserter vouching two subjects does not collide)", () => {
    const otherSubject = hex64("e".repeat(64));
    expect(buildCuratorRoleDTag(SUBJECT, ASSERTER)).not.toBe(
      buildCuratorRoleDTag(otherSubject, ASSERTER),
    );
  });
});

describe("toCuratorRoleEvent", () => {
  it("carries #p(subject), t(role), polarity, z(curator-roles), empty content; NO #a", () => {
    const e = toCuratorRoleEvent(apply);
    expect(e.kind).toBe(39999);
    expect(e.tags).toContainEqual(["d", "curatorrole--9bf2eed5--cccccccc"]);
    expect(e.tags).toContainEqual(["z", `39998:${LIBRARIAN}:curator-roles`]);
    expect(e.tags).toContainEqual(["p", SUBJECT]);
    expect(e.tags).toContainEqual(["t", "curator"]);
    expect(e.tags).toContainEqual(["polarity", "1"]);
    expect(e.content).toBe("");
    // The target is a pubkey, not a book — no #a tag.
    expect(e.tags.some((t) => t[0] === "a")).toBe(false);
  });

  it("encodes dispute polarity as -1", () => {
    expect(toCuratorRoleEvent({ ...apply, polarity: -1 }).tags).toContainEqual([
      "polarity",
      "-1",
    ]);
  });
});

describe("fromCuratorRoleEvent", () => {
  it("round-trips an apply and a dispute", () => {
    expect(fromCuratorRoleEvent(toCuratorRoleEvent(apply))).toEqual(apply);
    const dispute: CuratorRoleAssertion = { ...apply, polarity: -1 };
    expect(fromCuratorRoleEvent(toCuratorRoleEvent(dispute))).toEqual(dispute);
  });
});
