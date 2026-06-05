// FAILING TESTS (red) — Story 58 / ADR 0057 §2 (config parsing for the worker).
//
// Pure config parsers in apps/librarian/src/env.ts:
//   - parseSeedCurators(csv): string[]   — CSV of 64-lowercase-hex pubkeys,
//     validated `^[0-9a-f]{64}$`; empty/whitespace-only => hard error; a
//     non-hex / wrong-length entry => hard error.
//   - parseRelays(csv, fallback): string[]  — CSV of wss:// URLs, trimmed; an
//     empty csv falls back to the provided default list.
//   - DEFAULT_LIBRARIAN_GENERAL_RELAYS — the ADR §2 default list (damus,
//     primal, nos.lol, nostr.band — PROFILE_RELAYS minus dcosl; dcosl rejects
//     kind-3).
//
// RED reason: `../src/env` does NOT exist yet (the Implementer writes it). The
// import fails to resolve — a module-level red, not a tsc wall.
import { describe, expect, it } from "vitest";
import {
  parseSeedCurators,
  parseRelays,
  DEFAULT_LIBRARIAN_GENERAL_RELAYS,
} from "../src/env";

// Synthetic hex — never a real curator (ADR 0057 firewall).
const HEX_A = "a".repeat(64);
const HEX_B = "b".repeat(64);

describe("parseSeedCurators — CSV of 64-hex pubkeys", () => {
  it("parses a comma-separated list into a hex array, trimming whitespace", () => {
    expect(parseSeedCurators(` ${HEX_A} , ${HEX_B} `)).toEqual([HEX_A, HEX_B]);
  });

  it("parses a single entry", () => {
    expect(parseSeedCurators(HEX_A)).toEqual([HEX_A]);
  });

  it("throws a hard error on an empty / whitespace-only value", () => {
    expect(() => parseSeedCurators("")).toThrow();
    expect(() => parseSeedCurators("   ")).toThrow();
  });

  it("rejects an entry that is not 64 lowercase hex (wrong length)", () => {
    expect(() => parseSeedCurators("abc")).toThrow();
    expect(() => parseSeedCurators("a".repeat(63))).toThrow();
  });

  it("rejects an entry with non-hex / uppercase characters", () => {
    expect(() => parseSeedCurators("g".repeat(64))).toThrow();
    expect(() => parseSeedCurators("A".repeat(64))).toThrow();
  });

  it("rejects when any one entry in the CSV is invalid", () => {
    expect(() => parseSeedCurators(`${HEX_A},not-hex`)).toThrow();
  });
});

describe("parseRelays — CSV of wss URLs with a fallback default", () => {
  it("parses a comma-separated relay list, trimming whitespace", () => {
    expect(
      parseRelays(" wss://a.example , wss://b.example ", ["wss://fallback"]),
    ).toEqual(["wss://a.example", "wss://b.example"]);
  });

  it("falls back to the default list on an empty value", () => {
    const fallback = ["wss://default.example"];
    expect(parseRelays("", fallback)).toEqual(fallback);
  });
});

describe("DEFAULT_LIBRARIAN_GENERAL_RELAYS — ADR §2 default list (no dcosl)", () => {
  it("is the damus/primal/nos.lol/nostr.band set", () => {
    expect(DEFAULT_LIBRARIAN_GENERAL_RELAYS).toEqual([
      "wss://relay.damus.io",
      "wss://relay.primal.net",
      "wss://nos.lol",
      "wss://relay.nostr.band",
    ]);
  });

  it("does NOT include dcosl (dcosl rejects kind-3)", () => {
    for (const url of DEFAULT_LIBRARIAN_GENERAL_RELAYS) {
      expect(url).not.toContain("dcosl");
    }
  });
});
