// Story 98 / ADR 0088: the librarian's public profile is a reviewed constant,
// marked automated, with a relay list naming dcosl.
import { describe, expect, it } from "vitest";
import {
  LIBRARIAN_PROFILE,
  LIBRARIAN_RELAY_LIST,
  buildLibrarianKind0Template,
  buildLibrarianRelayListTemplate,
  buildTrustDesignationTemplate,
  trustDesignationTags,
} from "../src/profile-content";

describe("LIBRARIAN_PROFILE (ADR 0088 §1)", () => {
  it("keeps the operator's published fields", () => {
    expect(LIBRARIAN_PROFILE).toMatchObject({
      name: "unbnd",
      display_name: "Unbnd Librarian",
      nip05: "librarian@unbnd.ink",
      picture: "https://blossom.primal.net/53e4b6216c43ab1a3b5eb745cdc84b1c9cff15efd991e51b1554d08a30aa6105.jpg",
      website: "https://unbnd.ink",
    });
  });

  it("says it is automated, in the flag and in the about line", () => {
    expect(LIBRARIAN_PROFILE.bot).toBe(true);
    expect(String(LIBRARIAN_PROFILE.about)).toMatch(/automated/i);
    expect(String(LIBRARIAN_PROFILE.about)).not.toMatch(/[—–!]/);
  });

  it("carries no empty-string fields", () => {
    for (const v of Object.values(LIBRARIAN_PROFILE)) expect(v).not.toBe("");
  });
});

describe("buildLibrarianKind0Template", () => {
  it("builds a kind-0 with empty tags and the profile as JSON", () => {
    const t = buildLibrarianKind0Template(LIBRARIAN_PROFILE, 1_700_000_000);
    expect(t.kind).toBe(0);
    expect(t.created_at).toBe(1_700_000_000);
    expect(t.tags).toEqual([]);
    expect(JSON.parse(t.content)).toEqual(LIBRARIAN_PROFILE);
  });
});

describe("buildLibrarianRelayListTemplate (ADR 0088 §2)", () => {
  it("is a kind 10002 naming dcosl and the general relays, unmarked", () => {
    const t = buildLibrarianRelayListTemplate(LIBRARIAN_RELAY_LIST, 1_700_000_000);
    expect(t.kind).toBe(10002);
    expect(t.content).toBe("");
    expect(t.tags).toEqual(LIBRARIAN_RELAY_LIST.map((r) => ["r", r]));
    expect(LIBRARIAN_RELAY_LIST).toContain("wss://dcosl.brainstorm.world");
    for (const tag of t.tags) expect(tag).toHaveLength(2);
  });
});

describe("the trust designation (Story 102 / ADR 0090)", () => {
  const SCORER = "4328261a3e1e097a07e10304075792528485cd2ce445307758fb35d291b2e348";
  const RELAY = "wss://scores.brainstorm.world";

  it("keeps every well-formed /setup entry, in order", () => {
    expect(
      trustDesignationTags([
        ["30382:rank", SCORER, RELAY],
        ["30382:followers", SCORER, RELAY],
        ["30392", SCORER, RELAY],
      ]),
    ).toEqual([
      ["30382:rank", SCORER, RELAY],
      ["30382:followers", SCORER, RELAY],
      ["30392", SCORER, RELAY],
    ]);
  });

  it("drops malformed entries: a bad name, a short key, a non-wss relay, a missing relay", () => {
    expect(
      trustDesignationTags([
        ["rank", SCORER, RELAY],
        ["30382:rank", "abc", RELAY],
        ["30382:rank", SCORER, "https://scores.brainstorm.world"],
        ["30382:rank", SCORER],
        "nonsense" as never,
      ]),
    ).toEqual([]);
  });

  it("is a kind 10040 with empty content", () => {
    const t = buildTrustDesignationTemplate([["30382:rank", SCORER, RELAY]], 1_700_000_000);
    expect(t).toEqual({ kind: 10040, created_at: 1_700_000_000, content: "", tags: [["30382:rank", SCORER, RELAY]] });
  });
});
