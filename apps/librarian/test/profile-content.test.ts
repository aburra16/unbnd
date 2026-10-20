// Story 98 / ADR 0088: the librarian's public profile is a reviewed constant,
// marked automated, with a relay list naming dcosl.
import { describe, expect, it } from "vitest";
import {
  LIBRARIAN_PROFILE,
  LIBRARIAN_RELAY_LIST,
  buildLibrarianKind0Template,
  buildLibrarianRelayListTemplate,
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
