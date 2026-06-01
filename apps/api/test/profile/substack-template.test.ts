// Failing tests (red) for Story 22 — the pure substack merge/validate/build
// helpers. ADR 0022 Implementation notes, new file
// `apps/api/src/profile/substack-template.ts`:
//   - `validateSubstackUrl(input)` — trims; empty/absent ⇒ "clear"; http(s)
//     only; rejects ftp:/javascript:/non-URL/non-string via a typed
//     SubstackError("invalid_url").
//   - `mergeSubstack(rawContent, url|"clear")` — clones raw content (null ⇒ {}),
//     sets OR deletes `substack`, touches NOTHING else.
//   - `buildKind0Template(content, createdAt)` — { kind:0, created_at, content:
//     JSON.stringify, tags: [] }. NOT via toWireTemplate (no ["json", …] tag).
//
// None of these exist yet → import fails → red. The headline cases are AC-3
// (merge must not clobber any pre-existing field, including unknown ones) and
// AC-4 (clear DELETES the key, never leaves "" or null behind).
import { describe, expect, it } from "vitest";
import {
  validateSubstackUrl,
  mergeSubstack,
  buildKind0Template,
  SubstackError,
} from "../../src/profile/substack-template";

describe("validateSubstackUrl (AC-5)", () => {
  it("accepts an https URL and returns it trimmed", () => {
    expect(validateSubstackUrl("  https://mira.substack.com  ")).toBe(
      "https://mira.substack.com",
    );
  });

  it("accepts a plain http URL", () => {
    expect(validateSubstackUrl("http://example.com/feed")).toBe(
      "http://example.com/feed",
    );
  });

  it("treats empty / whitespace / absent as a clear signal", () => {
    expect(validateSubstackUrl("")).toBe("clear");
    expect(validateSubstackUrl("   ")).toBe("clear");
    expect(validateSubstackUrl(undefined)).toBe("clear");
    expect(validateSubstackUrl(null)).toBe("clear");
  });

  it("rejects a javascript: scheme", () => {
    // eslint-disable-next-line no-script-url
    expect(() => validateSubstackUrl("javascript:alert(1)")).toThrow(SubstackError);
  });

  it("rejects an ftp: scheme", () => {
    expect(() => validateSubstackUrl("ftp://files.example.com")).toThrow(
      SubstackError,
    );
  });

  it("rejects a value that is not a URL at all", () => {
    expect(() => validateSubstackUrl("notaurl")).toThrow(SubstackError);
  });

  it("rejects a non-string value", () => {
    expect(() => validateSubstackUrl(1234)).toThrow(SubstackError);
    expect(() => validateSubstackUrl({})).toThrow(SubstackError);
  });

  it("the thrown SubstackError carries the invalid_url code", () => {
    try {
      validateSubstackUrl("notaurl");
      throw new Error("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(SubstackError);
      expect((err as SubstackError).code).toBe("invalid_url");
    }
  });
});

describe("mergeSubstack — merge-don't-clobber (AC-3)", () => {
  const fullProfile = {
    name: "mira",
    about: "writes things",
    picture: "https://x/p.jpg",
    website: "https://mira.example",
    lud16: "mira@walletofsatoshi.com",
    banner: "https://x/banner.jpg",
    nip05: "mira@example.com",
    // A field Unbnd has no schema for — must survive the merge.
    weirdClientField: { nested: true, n: 7 },
  };

  it("sets substack while preserving EVERY other field, including the unknown one", () => {
    const merged = mergeSubstack(fullProfile, "https://mira.substack.com");
    expect(merged).toEqual({
      ...fullProfile,
      substack: "https://mira.substack.com",
    });
    // Explicit: the unknown field and lossy-dropped fields survive.
    expect(merged.weirdClientField).toEqual({ nested: true, n: 7 });
    expect(merged.lud16).toBe("mira@walletofsatoshi.com");
    expect(merged.banner).toBe("https://x/banner.jpg");
  });

  it("updates an existing substack value without touching other fields", () => {
    const before = { ...fullProfile, substack: "https://old.substack.com" };
    const merged = mergeSubstack(before, "https://new.substack.com");
    expect(merged.substack).toBe("https://new.substack.com");
    expect(merged.lud16).toBe("mira@walletofsatoshi.com");
    expect(merged.weirdClientField).toEqual({ nested: true, n: 7 });
  });

  it("does not mutate the input content object (clone, not in-place)", () => {
    const input = { ...fullProfile };
    mergeSubstack(input, "https://mira.substack.com");
    expect(input).not.toHaveProperty("substack");
  });

  it("null raw content ⇒ a fresh minimal kind-0 holding only substack (custodial no-kind-0, Q3)", () => {
    const merged = mergeSubstack(null, "https://mira.substack.com");
    expect(merged).toEqual({ substack: "https://mira.substack.com" });
  });
});

describe("mergeSubstack — clear (AC-4)", () => {
  const withSubstack = {
    name: "mira",
    lud16: "mira@wallet.com",
    substack: "https://mira.substack.com",
  };

  it("DELETES the substack key entirely (not '' , not null)", () => {
    const merged = mergeSubstack(withSubstack, "clear");
    expect(merged).not.toHaveProperty("substack");
    expect("substack" in merged).toBe(false);
  });

  it("preserves every other field when clearing", () => {
    const merged = mergeSubstack(withSubstack, "clear");
    expect(merged.name).toBe("mira");
    expect(merged.lud16).toBe("mira@wallet.com");
  });

  it("clearing content that has no substack is a clean no-op that still preserves all fields", () => {
    const noSubstack = { name: "mira", lud16: "mira@wallet.com" };
    const merged = mergeSubstack(noSubstack, "clear");
    expect(merged).toEqual(noSubstack);
    expect(merged).not.toHaveProperty("substack");
  });

  it("clearing null content yields an empty (but valid) content object", () => {
    const merged = mergeSubstack(null, "clear");
    expect(merged).toEqual({});
    expect(merged).not.toHaveProperty("substack");
  });
});

describe("mergeSubstack — name-floor (Story 27 AC-7)", () => {
  // ADR 0027 Decision 3: mergeSubstack now delegates to buildProfileKind0Content,
  // carrying the DB displayName as the `nameFloor`. The first-ever Substack write
  // for a custodial user (no prior kind-0) must carry BOTH the name (from the
  // floor) AND the substack — the latent "website-but-no-name" bug is gone.
  // The new optional third arg is the nameFloor.

  it("first Substack write with no prior kind-0 carries BOTH the name (from floor) AND substack (AC-7)", () => {
    const merged = mergeSubstack(null, "https://mira.substack.com", "Mira Calloway");
    expect(merged.name).toBe("Mira Calloway");
    expect(merged.display_name).toBe("Mira Calloway");
    expect(merged.substack).toBe("https://mira.substack.com");
  });

  it("the floor does NOT clobber an existing name in the raw content (merge-preserve still holds)", () => {
    const merged = mergeSubstack(
      { name: "mira-on-relay", display_name: "mira-on-relay", lud16: "m@w" },
      "https://mira.substack.com",
      "DB Floor Name",
    );
    expect(merged.name).toBe("mira-on-relay");
    expect(merged.display_name).toBe("mira-on-relay");
    expect(merged.substack).toBe("https://mira.substack.com");
    expect(merged.lud16).toBe("m@w");
  });

  it("a 'clear' with a nameFloor still removes substack but keeps/sets the floored name", () => {
    const merged = mergeSubstack(
      { substack: "https://old.substack.com" },
      "clear",
      "Mira Calloway",
    );
    expect(merged).not.toHaveProperty("substack");
    expect(merged.name).toBe("Mira Calloway");
  });
});

describe("buildKind0Template (AC-1/2/6)", () => {
  it("builds a kind-0 template with stringified content, empty tags, and the given created_at", () => {
    const content = { name: "mira", substack: "https://mira.substack.com" };
    const tpl = buildKind0Template(content, 1717000000);
    expect(tpl.kind).toBe(0);
    expect(tpl.tags).toEqual([]);
    expect(tpl.created_at).toBe(1717000000);
    expect(JSON.parse(tpl.content)).toEqual(content);
  });

  it("does NOT append a DList ['json', …] payload tag (kind-0 is flat metadata)", () => {
    const tpl = buildKind0Template({ substack: "https://x.substack.com" }, 1);
    expect(tpl.tags).toEqual([]);
    expect(tpl.tags.some((t) => t[0] === "json")).toBe(false);
  });
});
