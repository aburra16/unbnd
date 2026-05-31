// Failing tests (red) for Story 23 — the pure kind-3 follow merge/build helpers.
// ADR 0023 Decision 1 / Implementation notes, new file
// `apps/api/src/profile/follow-template.ts`:
//   - `mergeFollow(rawTags, targetHex, action)` — CLONE (never mutate the input);
//     follow APPENDS `["p", targetHex]` ONLY if no `p` tag with tag[1]===targetHex
//     exists (idempotent, no dup); unfollow REMOVES only the matching `p` tag(s);
//     preserves EVERY other tag verbatim — every other `p` tag with its full
//     `["p", hex, relayHint?, petname?]` payload AND its position, AND non-`p`
//     tags. null tags + follow ⇒ [["p", targetHex]]; null + unfollow ⇒ [].
//   - `buildKind3Template(tags, content, createdAt)` — { kind:3, created_at,
//     content (verbatim), tags }.
//   - `FollowError` (codes invalid_target | self_follow).
//
// None of these exist yet → the import fails to resolve → red. The headline
// cases are AC-3/AC-4/AC-5: the WHOLE follow list (relay-hints + petnames +
// non-`p` tags) must survive byte-intact through both follow and unfollow, and
// the input array must never be mutated (clone-not-clobber).
import { describe, expect, it } from "vitest";
import {
  mergeFollow,
  buildKind3Template,
  FollowError,
} from "../../src/profile/follow-template";

const TARGET = "a".repeat(64);
const FRIEND_1 = "b".repeat(64);
const FRIEND_2 = "c".repeat(64);

/** A realistic kind-3 tags array: a bare `p`, a `p` with a relay-hint, a `p`
 *  with a relay-hint + petname, and a non-`p` tag. Every one of these must
 *  survive a follow/unfollow of an unrelated target byte-for-byte. */
function richTags(): string[][] {
  return [
    ["p", FRIEND_1],
    ["p", FRIEND_2, "wss://relay.damus.io"],
    ["p", "d".repeat(64), "wss://nos.lol", "alice"],
    ["t", "books"],
  ];
}

describe("mergeFollow — follow appends the target p-tag (AC-3)", () => {
  it("appends ['p', targetHex] when the target is not already followed", () => {
    const merged = mergeFollow([["p", FRIEND_1]], TARGET, "follow");
    expect(merged).toContainEqual(["p", TARGET]);
    expect(merged).toContainEqual(["p", FRIEND_1]);
    expect(merged).toHaveLength(2);
  });

  it("builds a fresh single-follow list from null tags (viewer had no kind-3)", () => {
    expect(mergeFollow(null, TARGET, "follow")).toEqual([["p", TARGET]]);
  });

  it("is idempotent: following an already-followed target adds NO duplicate", () => {
    const before = [["p", FRIEND_1], ["p", TARGET, "wss://relay.example", "bob"]];
    const merged = mergeFollow(before, TARGET, "follow");
    const targetTags = merged.filter((t) => t[0] === "p" && t[1] === TARGET);
    expect(targetTags).toHaveLength(1);
    // The existing target tag keeps its full payload (not flattened to a bare p).
    expect(targetTags[0]).toEqual(["p", TARGET, "wss://relay.example", "bob"]);
    expect(merged).toHaveLength(before.length);
  });
});

describe("mergeFollow — unfollow removes ONLY the target p-tag (AC-4)", () => {
  it("removes only the matching p-tag, leaving every other follow", () => {
    const before = [["p", FRIEND_1], ["p", TARGET], ["p", FRIEND_2]];
    const merged = mergeFollow(before, TARGET, "unfollow");
    expect(merged).not.toContainEqual(["p", TARGET]);
    expect(merged).toContainEqual(["p", FRIEND_1]);
    expect(merged).toContainEqual(["p", FRIEND_2]);
    expect(merged).toHaveLength(2);
  });

  it("removes the target even when it carries a relay-hint + petname", () => {
    const before = [["p", FRIEND_1], ["p", TARGET, "wss://r", "carol"]];
    const merged = mergeFollow(before, TARGET, "unfollow");
    expect(merged.some((t) => t[0] === "p" && t[1] === TARGET)).toBe(false);
    expect(merged).toContainEqual(["p", FRIEND_1]);
  });

  it("unfollow-when-not-following is a no-op: the list is unchanged, no one stripped", () => {
    const before = richTags();
    const merged = mergeFollow(before, TARGET, "unfollow");
    expect(merged).toEqual(before);
  });

  it("unfollow on null tags yields an empty list (no error)", () => {
    expect(mergeFollow(null, TARGET, "unfollow")).toEqual([]);
  });
});

describe("mergeFollow — merge-don't-clobber: the whole list survives byte-intact (AC-5)", () => {
  it("FOLLOW preserves every pre-existing tag (relay-hints, petnames, non-p) verbatim and in order", () => {
    const before = richTags();
    const merged = mergeFollow(before, TARGET, "follow");
    // Every original tag is still present, byte-identical.
    expect(merged).toContainEqual(["p", FRIEND_1]);
    expect(merged).toContainEqual(["p", FRIEND_2, "wss://relay.damus.io"]);
    expect(merged).toContainEqual(["p", "d".repeat(64), "wss://nos.lol", "alice"]);
    expect(merged).toContainEqual(["t", "books"]);
    // Plus the one new target tag.
    expect(merged).toContainEqual(["p", TARGET]);
    // The original four tags keep their relative order at the front.
    expect(merged.slice(0, 4)).toEqual(before);
  });

  it("UNFOLLOW of one mid-list target preserves the relay-hint/petname/non-p payloads of all the rest", () => {
    const before = [
      ["p", FRIEND_1, "wss://relay.damus.io"],
      ["p", TARGET, "wss://nos.lol", "doomed"],
      ["p", FRIEND_2, "wss://relay.primal.net", "dave"],
      ["t", "books"],
    ];
    const merged = mergeFollow(before, TARGET, "unfollow");
    expect(merged).toEqual([
      ["p", FRIEND_1, "wss://relay.damus.io"],
      ["p", FRIEND_2, "wss://relay.primal.net", "dave"],
      ["t", "books"],
    ]);
  });
});

describe("mergeFollow — clone, never mutate the input (AC-3/AC-4/AC-5)", () => {
  it("does not mutate the input tags array on follow", () => {
    const before = richTags();
    const snapshot = JSON.parse(JSON.stringify(before));
    mergeFollow(before, TARGET, "follow");
    expect(before).toEqual(snapshot);
  });

  it("does not mutate the input tags array on unfollow", () => {
    const before = [["p", FRIEND_1], ["p", TARGET], ["p", FRIEND_2]];
    const snapshot = JSON.parse(JSON.stringify(before));
    mergeFollow(before, TARGET, "unfollow");
    expect(before).toEqual(snapshot);
  });

  it("does not share inner-tag references with the input (a deep-enough clone)", () => {
    const before = richTags();
    const merged = mergeFollow(before, TARGET, "follow");
    const mergedFriend1 = merged.find((t) => t[0] === "p" && t[1] === FRIEND_1)!;
    // Mutating a returned inner tag must not reach back into the input.
    mergedFriend1.push("MUTATED");
    expect(before.find((t) => t[1] === FRIEND_1)).toEqual(["p", FRIEND_1]);
  });
});

describe("buildKind3Template (AC-3/AC-4 build step)", () => {
  it("builds a kind-3 template carrying the merged tags and the given created_at", () => {
    const tags = [["p", FRIEND_1], ["p", TARGET]];
    const tpl = buildKind3Template(tags, "", 1717000000);
    expect(tpl.kind).toBe(3);
    expect(tpl.tags).toEqual(tags);
    expect(tpl.created_at).toBe(1717000000);
  });

  it("preserves the kind-3 content VERBATIM (a legacy relay-list JSON must never be clobbered)", () => {
    const legacy = '{"wss://relay.damus.io":{"read":true,"write":true}}';
    const tpl = buildKind3Template([["p", TARGET]], legacy, 1);
    expect(tpl.content).toBe(legacy);
  });

  it("keeps an empty content as the empty string (viewer had no kind-3)", () => {
    const tpl = buildKind3Template([["p", TARGET]], "", 1);
    expect(tpl.content).toBe("");
  });
});

describe("FollowError", () => {
  it("is an Error subclass carrying a typed code", () => {
    const err = new FollowError("self_follow", "You cannot follow yourself.");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(FollowError);
    expect(err.code).toBe("self_follow");
  });
});
