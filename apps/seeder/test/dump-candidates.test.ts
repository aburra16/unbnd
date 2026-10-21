// FAILING TESTS — Story 109 / ADR 0097 §1–§3: the five dumps into candidate
// books, with memory kept to the candidates.
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { extractCandidates } from "../src/dump/candidates";
import type { Candidate } from "../src/dump/plan";

const j = (o: object) => JSON.stringify(o).replace(/":/g, '": ').replace(/,"/g, ', "');
const row = (type: string, key: string, o: object) => `${type}\t${key}\t1\t2026-09-01T00:00:00\t${j(o)}`;

async function dumps() {
  const dir = await mkdtemp(join(tmpdir(), "dumps-"));
  const write = async (name: string, lines: string[]) => {
    const path = join(dir, name);
    await writeFile(path, gzipSync(lines.join("\n") + "\n"));
    return path;
  };
  const readers = (work: string, n: number) => Array.from({ length: n }, () => `/works/${work}\t\\N\tAlready Read\t2020-01-01`);
  return {
    readingLog: await write("rl.gz", [...readers("OL1W", 6), ...readers("OL2W", 2), ...readers("OL9W", 3), ...readers("OL3W", 3)]),
    redirects: await write("rd.gz", [
      row("/type/redirect", "/works/OL9W", { key: "/works/OL9W", location: "/works/OL3W" }),
      row("/type/redirect", "/authors/OL8A", { key: "/authors/OL8A", location: "/authors/OL7A" }),
    ]),
    works: await write("w.gz", [
      row("/type/work", "/works/OL1W", { title: "Orbital", covers: [11], subjects: ["Space"], description: "Aboard.", authors: [{ author: { key: "/authors/OL5A" } }] }),
      row("/type/work", "/works/OL2W", { title: "Few readers", authors: [{ author: { key: "/authors/OL5A" } }] }),
      row("/type/work", "/works/OL3W", { title: "Merged", authors: [{ author: { key: "/authors/OL8A" } }] }),
    ]),
    editions: await write("e.gz", [
      row("/type/edition", "/books/OL1M", { works: [{ key: "/works/OL1W" }], languages: [{ key: "/languages/eng" }], publish_date: "2023", number_of_pages: 200, isbn_13: ["9780802163103"] }),
      row("/type/edition", "/books/OL2M", { works: [{ key: "/works/OL1W" }], publish_date: "2024" }),
      row("/type/edition", "/books/OL3M", { works: [{ key: "/works/OL2W" }], publish_date: "2001" }),
      row("/type/edition", "/books/OL4M", { works: [{ key: "/works/OL3W" }], publish_date: "1999", covers: [33] }),
    ]),
    authors: await write("a.gz", [
      row("/type/author", "/authors/OL5A", { name: "Samantha Harvey", birth_date: "1975" }),
      row("/type/author", "/authors/OL7A", { name: "Ann Other", birth_date: "1 May 1950" }),
    ]),
  };
}

describe("extractCandidates", () => {
  it("keeps works with enough readers (through one redirect) and builds their search fields", async () => {
    const files = await dumps();
    const out: Candidate[] = [];
    const result = await extractCandidates(files, { readersMin: 5, onCandidate: (c) => { out.push(c); } });
    expect(out.map((c) => [c.doc.key, c.readers])).toEqual([["/works/OL1W", 6], ["/works/OL3W", 6]]);
    const orbital = out[0]!;
    expect(orbital.doc).toMatchObject({
      title: "Orbital", author_name: ["Samantha Harvey"], author_key: ["OL5A"], edition_count: 2,
      cover_i: 11, language: ["eng"], first_publish_year: 2023, publish_year: [2023, 2024], isbn: ["9780802163103"], subject: ["Space"],
    });
    expect(orbital.description).toBe("Aboard.");
    expect(out[1]!.doc).toMatchObject({ author_name: ["Ann Other"], author_key: ["OL8A"], cover_i: 33 });
    expect(result.authors.get("OL8A")).toEqual({ name: "Ann Other", birthYear: 1950 });
    expect(result.stats).toMatchObject({ candidates: 2 });
  });

  it("a malformed redirect line is skipped, and the candidate is told which works were merged into it", async () => {
    const files = await dumps();
    const { writeFile: wf } = await import("node:fs/promises");
    const { gunzipSync, gzipSync: gz } = await import("node:zlib");
    const { readFile } = await import("node:fs/promises");
    const lines = gunzipSync(await readFile(files.redirects)).toString() + "/type/redirect\t/works/OL5W\t1\t2026\t{not json\n";
    await wf(files.redirects, gz(lines));
    const merged: Array<[string, string[]]> = [];
    await extractCandidates(files, {
      readersMin: 5,
      onCandidate: (c, _authors, mergedFrom) => { merged.push([c.doc.key!, mergedFrom]); },
    });
    expect(merged).toEqual([["/works/OL1W", []], ["/works/OL3W", ["OL9W"]]]);
  });
});
