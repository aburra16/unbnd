// FAILING TESTS (red) — Story 58 / ADR 0057 §3 (kind-3 seed-follow builder).
//
// Pure, no-I/O builders that mirror apps/api/src/profile/follow-template.ts's
// merge semantics, generalized to MANY seed-curator targets in one pass:
//   - mergeSeedFollows(rawTags, seedCuratorHexes): string[][]
//   - buildLibrarianKind3Template(tags, content, createdAt): NostrEventTemplate
//
// Semantics pinned by ADR 0057 §3 (cribbed from mergeFollow):
//   - given null existing tags + N seeds => exactly N ["p", hex] tags in input
//     order (one p tag per SEED_CURATORS entry).
//   - MERGE-PRESERVING: an existing kind-3's non-`p` tags and relay-hint/petname
//     `p`-tag payloads are preserved verbatim and in order; seeds are unioned in.
//   - never a duplicate `p` tag (a seed already present is a no-op, payload
//     intact); deterministic / pure (input not mutated).
//   - buildLibrarianKind3Template => kind 3, content preserved VERBATIM, tags
//     passed through (NOT toWireTemplate).
//
// RED reason: `../src/follows-template` does NOT exist yet (the Implementer
// writes it). The import fails to resolve, so every test fails with a readable
// "Cannot find module ../src/follows-template" — a module-level red, not a tsc
// wall. Synthetic hex pubkeys only (firewall): no real curator pubkey ever.
import { describe, expect, it } from "vitest";
import type { NostrEventTemplate } from "@unbnd/schemas";
import {
  mergeSeedFollows,
  buildLibrarianKind3Template,
} from "../src/follows-template";

// Synthetic 64-lowercase-hex pubkeys — NEVER a real curator (ADR 0057 firewall).
const SEED_A = "a".repeat(64);
const SEED_B = "b".repeat(64);
const SEED_C = "c".repeat(64);
const EXISTING = "e".repeat(64);

describe("mergeSeedFollows — null existing kind-3 (first publish)", () => {
  it("produces exactly one `p` tag per seed curator, in input order", () => {
    const tags = mergeSeedFollows(null, [SEED_A, SEED_B, SEED_C]);
    expect(tags).toEqual([
      ["p", SEED_A],
      ["p", SEED_B],
      ["p", SEED_C],
    ]);
  });

  it("produces an empty tag set for an empty seed list (no `p` tags invented)", () => {
    expect(mergeSeedFollows(null, [])).toEqual([]);
  });
});

describe("mergeSeedFollows — merge-preserving over an existing kind-3", () => {
  it("preserves every non-`p` tag verbatim and in order, then unions the seeds", () => {
    const raw: string[][] = [
      ["client", "unbnd"],
      ["p", EXISTING, "wss://relay.example", "alice"],
    ];
    const merged = mergeSeedFollows(raw, [SEED_A, SEED_B]);
    expect(merged).toEqual([
      ["client", "unbnd"],
      ["p", EXISTING, "wss://relay.example", "alice"],
      ["p", SEED_A],
      ["p", SEED_B],
    ]);
  });

  it("preserves an existing `p` tag's relay-hint / petname payload (never flattens it)", () => {
    const raw: string[][] = [["p", EXISTING, "wss://relay.example", "alice"]];
    const merged = mergeSeedFollows(raw, [SEED_A]);
    // The existing p tag keeps its full NIP-02 payload AND its position.
    expect(merged[0]).toEqual(["p", EXISTING, "wss://relay.example", "alice"]);
    expect(merged).toContainEqual(["p", SEED_A]);
  });

  it("does NOT add a duplicate when a seed is already followed (idempotent union)", () => {
    const raw: string[][] = [["p", SEED_A, "wss://relay.example", "alice"]];
    const merged = mergeSeedFollows(raw, [SEED_A, SEED_B]);
    // SEED_A keeps its existing payload, is not re-added; only SEED_B is new.
    const pForA = merged.filter(
      (t: string[]) => t[0] === "p" && t[1] === SEED_A,
    );
    expect(pForA).toEqual([["p", SEED_A, "wss://relay.example", "alice"]]);
    expect(
      merged.filter((t: string[]) => t[0] === "p" && t[1] === SEED_B),
    ).toEqual([["p", SEED_B]]);
  });

  it("is idempotent: re-running with the merged result as input is a no-op", () => {
    const first = mergeSeedFollows(null, [SEED_A, SEED_B]);
    const second = mergeSeedFollows(first, [SEED_A, SEED_B]);
    expect(second).toEqual(first);
  });
});

describe("mergeSeedFollows — purity", () => {
  it("does not mutate the input rawTags or its inner tag arrays", () => {
    const inner = ["p", EXISTING, "wss://relay.example"];
    const raw: string[][] = [inner];
    const before = JSON.stringify(raw);
    mergeSeedFollows(raw, [SEED_A]);
    expect(JSON.stringify(raw)).toBe(before);
    // The returned array must not share the input's inner reference.
    const merged = mergeSeedFollows(raw, [SEED_A]);
    expect(merged[0]).not.toBe(inner);
  });
});

describe("buildLibrarianKind3Template", () => {
  it("builds a kind-3 with the merged tags and content preserved verbatim", () => {
    const tags = mergeSeedFollows(null, [SEED_A]);
    const template: NostrEventTemplate = buildLibrarianKind3Template(
      tags,
      "{\"wss://relay.example\":{\"read\":true}}",
      1_700_000_000,
    );
    expect(template.kind).toBe(3);
    expect(template.created_at).toBe(1_700_000_000);
    expect(template.content).toBe("{\"wss://relay.example\":{\"read\":true}}");
    expect(template.tags).toEqual([["p", SEED_A]]);
  });

  it("preserves an empty content string (no relay-list JSON to clobber)", () => {
    const template = buildLibrarianKind3Template([], "", 42);
    expect(template).toEqual({ kind: 3, created_at: 42, content: "", tags: [] });
  });
});
