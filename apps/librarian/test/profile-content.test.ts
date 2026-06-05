// FAILING TESTS (red) — Story 58 / ADR 0057 §3 (kind-0 profile builder).
//
// Pure, no-I/O builders that mirror apps/api/src/profile/kind0.ts:
//   - buildLibrarianProfileContent({ name, about?, picture?, nip05? })
//       => Record<string, unknown>  (the kind-0 content object)
//   - buildLibrarianKind0Template(content, createdAt) => NostrEventTemplate
//
// Semantics pinned by ADR 0057 §3:
//   - `name` AND `display_name` both set from LIBRARIAN_NAME (name-floor
//     invariant), `name` required.
//   - about / picture / nip05 emitted ONLY when present; omitted (not empty
//     strings) when absent.
//   - deterministic: the same config yields the exact same content; the
//     template stringifies that content as valid JSON with empty tags.
//
// RED reason: `../src/profile-content` does NOT exist yet (the Implementer
// writes it). The import fails to resolve — a module-level red, not a tsc wall.
import { describe, expect, it } from "vitest";
import {
  buildLibrarianProfileContent,
  buildLibrarianKind0Template,
} from "../src/profile-content";

describe("buildLibrarianProfileContent — required name", () => {
  it("sets both `name` and `display_name` from LIBRARIAN_NAME", () => {
    const content = buildLibrarianProfileContent({ name: "Unbnd Librarian" });
    expect(content.name).toBe("Unbnd Librarian");
    expect(content.display_name).toBe("Unbnd Librarian");
  });
});

describe("buildLibrarianProfileContent — optional fields", () => {
  it("includes about / picture / nip05 only when present", () => {
    const content = buildLibrarianProfileContent({
      name: "Unbnd Librarian",
      about: "Curated book records.",
      picture: "https://unbnd.ink/logo.png",
      nip05: "librarian@unbnd.ink",
    });
    expect(content).toEqual({
      name: "Unbnd Librarian",
      display_name: "Unbnd Librarian",
      about: "Curated book records.",
      picture: "https://unbnd.ink/logo.png",
      nip05: "librarian@unbnd.ink",
    });
  });

  it("omits absent optionals entirely (no empty strings on the wire)", () => {
    const content = buildLibrarianProfileContent({ name: "Unbnd Librarian" });
    expect(content).toEqual({
      name: "Unbnd Librarian",
      display_name: "Unbnd Librarian",
    });
    expect("about" in content).toBe(false);
    expect("picture" in content).toBe(false);
    expect("nip05" in content).toBe(false);
  });

  it("omits an optional supplied as an empty string (not emitted)", () => {
    const content = buildLibrarianProfileContent({
      name: "Unbnd Librarian",
      about: "",
      picture: "",
      nip05: "",
    });
    expect("about" in content).toBe(false);
    expect("picture" in content).toBe(false);
    expect("nip05" in content).toBe(false);
  });
});

describe("buildLibrarianProfileContent — purity / determinism", () => {
  it("returns the same content for the same config", () => {
    const a = buildLibrarianProfileContent({ name: "L", about: "x" });
    const b = buildLibrarianProfileContent({ name: "L", about: "x" });
    expect(a).toEqual(b);
  });
});

describe("buildLibrarianKind0Template", () => {
  it("builds a kind-0 event with empty tags and the content as JSON", () => {
    const content = buildLibrarianProfileContent({
      name: "Unbnd Librarian",
      about: "Curated book records.",
    });
    const template = buildLibrarianKind0Template(content, 1_700_000_000);
    expect(template.kind).toBe(0);
    expect(template.created_at).toBe(1_700_000_000);
    expect(template.tags).toEqual([]);
    // content is valid JSON of the content object.
    expect(JSON.parse(template.content)).toEqual({
      name: "Unbnd Librarian",
      display_name: "Unbnd Librarian",
      about: "Curated book records.",
    });
  });
});
