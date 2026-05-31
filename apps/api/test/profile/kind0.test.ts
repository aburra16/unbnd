// Failing tests (red) for Story 27 — the pure kind-0 builder seam.
// ADR 0027 Decision 1 + Implementation notes, new file
// `apps/api/src/profile/kind0.ts` (pure, no I/O):
//   - PROFILE_KIND0_FIELDS — the privacy whitelist (the closed patch surface).
//   - buildProfileKind0Content(rawPrev, patch, nameFloor?) — clone-not-mutate
//     merge-preserve. Copies ONLY whitelisted keys off the patch; preserves all
//     of rawPrev's own keys (lossless). When nameFloor is given AND the merged
//     content has no non-empty `name`, injects the floor into BOTH name and
//     display_name (Open Question 1 — write both).
//   - hasResolvableName(content) — true iff content has a non-empty string name.
//   - buildKind0Template(content, createdAt) — { kind:0, content: JSON.stringify,
//     tags: [] }, lifted from substack-template.ts.
//
// None of these exist yet → import fails → red.
//
// Headline tests:
//   AC-3 (PRIVACY): a patch carrying email/password/userId/sessionToken drops
//     every non-whitelisted key; those strings never reach the built content.
//   AC-1 / AC-7: the nameFloor mechanic puts name == display_name == D.
import { describe, expect, it } from "vitest";
import {
  PROFILE_KIND0_FIELDS,
  buildProfileKind0Content,
  hasResolvableName,
  buildKind0Template,
} from "../../src/profile/kind0";

describe("PROFILE_KIND0_FIELDS — the privacy whitelist (AC-3)", () => {
  it("contains the public profile fields and NONE of the account/PII fields", () => {
    // The whitelist is the closed patch surface: only public kind-0 metadata.
    expect(PROFILE_KIND0_FIELDS).toContain("name");
    expect(PROFILE_KIND0_FIELDS).toContain("display_name");
    expect(PROFILE_KIND0_FIELDS).toContain("substack");
    // Hard constraint: account/PII fields must never be in the whitelist.
    expect(PROFILE_KIND0_FIELDS).not.toContain("email");
    expect(PROFILE_KIND0_FIELDS).not.toContain("password");
    expect(PROFILE_KIND0_FIELDS).not.toContain("userId");
    expect(PROFILE_KIND0_FIELDS).not.toContain("sessionToken");
    expect(PROFILE_KIND0_FIELDS).not.toContain("token");
  });
});

describe("buildProfileKind0Content — name-floor (AC-1, AC-7)", () => {
  it("with null rawPrev and a displayName floor, sets BOTH name and display_name to the floor", () => {
    const content = buildProfileKind0Content(null, { displayName: "Mira Calloway" }, "Mira Calloway");
    expect(content.name).toBe("Mira Calloway");
    expect(content.display_name).toBe("Mira Calloway");
  });

  it("with a Substack-only patch and a nameFloor, carries BOTH the name (from floor) AND substack (AC-7)", () => {
    // Substack-first custodial user: no prior kind-0, but the DB displayName is
    // threaded as the floor — so the first Substack write is not name-less.
    const content = buildProfileKind0Content(
      null,
      { substack: "https://mira.substack.com" },
      "Mira Calloway",
    );
    expect(content.name).toBe("Mira Calloway");
    expect(content.display_name).toBe("Mira Calloway");
    expect(content.substack).toBe("https://mira.substack.com");
  });

  it("a website-bearing patch with a nameFloor keeps website AND gains the name (the latent bug is gone, AC-7)", () => {
    const content = buildProfileKind0Content(
      null,
      { substack: "https://mira.substack.com", website: "https://mira.example" } as never,
      "Mira Calloway",
    );
    expect(content.name).toBe("Mira Calloway");
    expect(content.substack).toBe("https://mira.substack.com");
    expect(content.website).toBe("https://mira.example");
  });

  it("does NOT clobber an existing name when rawPrev already has one (floor is a floor, not an override)", () => {
    // merge-preserve: a Substack write on a user who already has a kind-0 name
    // must keep that name, not overwrite it with the DB floor.
    const content = buildProfileKind0Content(
      { name: "mira-on-relay", display_name: "mira-on-relay", lud16: "m@w" },
      { substack: "https://mira.substack.com" },
      "DB Floor Name",
    );
    expect(content.name).toBe("mira-on-relay");
    expect(content.display_name).toBe("mira-on-relay");
    expect(content.substack).toBe("https://mira.substack.com");
    expect(content.lud16).toBe("m@w");
  });

  it("injects the floor when rawPrev exists but has an EMPTY name (reconciliation repair, AC-5)", () => {
    const content = buildProfileKind0Content(
      { name: "", substack: "https://mira.substack.com" },
      {},
      "Mira Calloway",
    );
    expect(content.name).toBe("Mira Calloway");
    expect(content.display_name).toBe("Mira Calloway");
    // The pre-existing substack survives the repair.
    expect(content.substack).toBe("https://mira.substack.com");
  });

  it("with no nameFloor and no name in rawPrev/patch, does not invent a name", () => {
    const content = buildProfileKind0Content({ lud16: "m@w" }, { substack: "https://x.substack.com" });
    expect(content).not.toHaveProperty("name");
    expect(content).not.toHaveProperty("display_name");
    expect(content.substack).toBe("https://x.substack.com");
    expect(content.lud16).toBe("m@w");
  });
});

describe("buildProfileKind0Content — PRIVACY whitelist enforcement (AC-3)", () => {
  it("DROPS email / password / userId / sessionToken handed in the patch — they never enter the content", () => {
    const content = buildProfileKind0Content(
      null,
      {
        displayName: "Mira Calloway",
        // Junk that must be structurally unable to enter a public broadcast event:
        email: "reader@example.com",
        password: "abcdefghij",
        userId: "11111111-1111-1111-1111-111111111111",
        sessionToken: "tok-signup-secret",
        token: "tok-signup-secret",
      } as never,
      "Mira Calloway",
    );
    // Only whitelisted fields present.
    expect(content).not.toHaveProperty("email");
    expect(content).not.toHaveProperty("password");
    expect(content).not.toHaveProperty("userId");
    expect(content).not.toHaveProperty("sessionToken");
    expect(content).not.toHaveProperty("token");
    // STRICT: the email string appears nowhere in the serialized content.
    expect(JSON.stringify(content)).not.toContain("reader@example.com");
    expect(JSON.stringify(content)).not.toContain("abcdefghij");
    expect(JSON.stringify(content)).not.toContain("tok-signup-secret");
    // The legitimate name still came through.
    expect(content.name).toBe("Mira Calloway");
  });

  it("only emits keys that are in PROFILE_KIND0_FIELDS off the patch", () => {
    const content = buildProfileKind0Content(
      null,
      { displayName: "D", substack: "https://x.substack.com", bogusKey: "leak" } as never,
      "D",
    );
    for (const key of Object.keys(content)) {
      const allowed = [...PROFILE_KIND0_FIELDS] as string[];
      expect(allowed).toContain(key);
    }
    expect(content).not.toHaveProperty("bogusKey");
  });
});

describe("buildProfileKind0Content — merge-preserve / clone (lossless)", () => {
  it("preserves rawPrev's own unknown keys untouched (lossless merge)", () => {
    const content = buildProfileKind0Content(
      { name: "mira", weirdClientField: { nested: true, n: 7 }, lud16: "m@w" },
      { substack: "https://mira.substack.com" },
      "mira",
    );
    expect(content.weirdClientField).toEqual({ nested: true, n: 7 });
    expect(content.lud16).toBe("m@w");
    expect(content.substack).toBe("https://mira.substack.com");
  });

  it("does not mutate the rawPrev input object (clone, not in-place)", () => {
    const input = { name: "mira" };
    buildProfileKind0Content(input, { substack: "https://mira.substack.com" }, "mira");
    expect(input).not.toHaveProperty("substack");
  });
});

describe("hasResolvableName (drives AC-5 reconciliation)", () => {
  it("true for a non-empty string name", () => {
    expect(hasResolvableName({ name: "Mira" })).toBe(true);
  });
  it("false for null content", () => {
    expect(hasResolvableName(null)).toBe(false);
  });
  it("false for an empty / whitespace-only name", () => {
    expect(hasResolvableName({ name: "" })).toBe(false);
    expect(hasResolvableName({ name: "   " })).toBe(false);
  });
  it("false for content with no name key at all (only display_name/substack)", () => {
    expect(hasResolvableName({ substack: "https://x.substack.com" })).toBe(false);
    expect(hasResolvableName({ display_name: "Mira" })).toBe(false);
  });
});

describe("buildKind0Template (lifted from substack-template.ts)", () => {
  it("builds a kind-0 template with stringified content, empty tags, and the given created_at", () => {
    const content = { name: "Mira", display_name: "Mira" };
    const tpl = buildKind0Template(content, 1717000000);
    expect(tpl.kind).toBe(0);
    expect(tpl.tags).toEqual([]);
    expect(tpl.created_at).toBe(1717000000);
    expect(JSON.parse(tpl.content)).toEqual(content);
  });

  it("does NOT append a DList ['json', …] payload tag (kind-0 is flat metadata)", () => {
    const tpl = buildKind0Template({ name: "Mira" }, 1);
    expect(tpl.tags).toEqual([]);
    expect(tpl.tags.some((t) => t[0] === "json")).toBe(false);
  });
});
