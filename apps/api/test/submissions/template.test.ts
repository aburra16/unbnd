import { describe, expect, it } from "vitest";
import { asHexPubkey } from "@unbnd/schemas";
import type { Config } from "../../src/config";
import { buildSubmissionTemplate, submissionSlug, SubmissionError } from "../../src/submissions/template";

const LIB = "1".repeat(63) + "a";
const PK = "9".repeat(64);
const cfg = { librarianPubkey: LIB } as unknown as Config;

describe("submissionSlug", () => {
  it("uses ISBN when present", () => {
    expect(submissionSlug({ submitterPubkey: PK, title: "X", authorName: "Y", isbn13: "978-0-8021-6154-3" }))
      .toBe(`sub--isbn-9780802161543--${PK.slice(0, 8)}`);
  });
  it("falls back to title+author, suffixed by pubkey", () => {
    expect(submissionSlug({ submitterPubkey: PK, title: "The Great Book", authorName: "Ada Lovelace" }))
      .toBe(`sub--the-great-book--ada-lovelace--${PK.slice(0, 8)}`);
  });
});

describe("buildSubmissionTemplate", () => {
  it("builds a kind-39999 z-tagged to book-submissions", () => {
    const t = buildSubmissionTemplate(cfg, { submitterPubkey: PK, title: "Alpha", authorName: "Ada" }, 1);
    expect(t.kind).toBe(39999);
    expect(t.tags).toContainEqual(["z", `39998:${LIB}:book-submissions`]);
    expect(t.tags).toContainEqual(["title", "Alpha"]);
  });
  it("sets authorPubkey + author source when isAuthor", () => {
    const t = buildSubmissionTemplate(
      cfg,
      { submitterPubkey: PK, title: "Alpha", authorName: "Ada", isAuthor: true },
      1,
    );
    expect(t.tags).toContainEqual(["p", asHexPubkey(PK)]);
  });
  it("throws on missing title/author and when unconfigured", () => {
    expect(() => buildSubmissionTemplate(cfg, { submitterPubkey: PK, title: "", authorName: "Ada" }, 1))
      .toThrow(SubmissionError);
    expect(() =>
      buildSubmissionTemplate({} as unknown as Config, { submitterPubkey: PK, title: "A", authorName: "B" }, 1),
    ).toThrow(/not configured/i);
  });
});
