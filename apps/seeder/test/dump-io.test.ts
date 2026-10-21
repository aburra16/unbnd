// FAILING TESTS — Story 109 / ADR 0097: reading gzip dumps line by line, and
// downloading them with the md5 archive.org lists.
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { dumpFileName, ensureDump, gzLines, parseFilesXml } from "../src/dump/io";

const md5 = (b: Buffer | string) => createHash("md5").update(b).digest("hex");

describe("gzLines", () => {
  it("yields each line of a gzip file, without the newline", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dump-"));
    const f = join(dir, "x.txt.gz");
    await writeFile(f, gzipSync("one\ttwo\nthree\n\nfour"));
    const out: string[] = [];
    for await (const line of gzLines(f)) out.push(line);
    expect(out).toEqual(["one\ttwo", "three", "", "four"]);
  });
});

describe("archive.org files", () => {
  it("names a dump file", () => {
    expect(dumpFileName("editions", "2026-09-30")).toBe("ol_dump_editions_2026-09-30.txt.gz");
  });

  it("reads the md5 of each file from files.xml", () => {
    const xml = `<files><file name="ol_dump_works_2026-09-30.txt.gz" source="original"><md5>4b36fae3348000834fd444855cc9c263</md5><size>9</size></file>
<file name="other.xml"><md5>zzz</md5></file></files>`;
    expect(parseFilesXml(xml).get("ol_dump_works_2026-09-30.txt.gz")).toBe("4b36fae3348000834fd444855cc9c263");
  });

  it("downloads a file, checks its md5, and skips one already verified", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dump-"));
    const body = gzipSync("line\n");
    const fetchImpl = vi.fn(async () => new Response(body));
    const path = await ensureDump({ dir, kind: "works", date: "2026-09-30", md5: md5(body), fetchImpl });
    expect(await readFile(path)).toEqual(body);
    await ensureDump({ dir, kind: "works", date: "2026-09-30", md5: md5(body), fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith("https://archive.org/download/ol_dump_2026-09-30/ol_dump_works_2026-09-30.txt.gz", expect.anything());
  });

  it("refuses a file whose md5 does not match, and keeps nothing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dump-"));
    const fetchImpl = vi.fn(async () => new Response(gzipSync("tampered\n")));
    await expect(ensureDump({ dir, kind: "works", date: "2026-09-30", md5: "0".repeat(32), fetchImpl })).rejects.toThrow(/md5/);
    await expect(readFile(join(dir, "ol_dump_works_2026-09-30.txt.gz"))).rejects.toThrow();
  });

  it("a file already on disk without a marker is hashed once and kept when it matches", async () => {
    const dir = await mkdtemp(join(tmpdir(), "dump-"));
    const body = gzipSync("line\n");
    await writeFile(join(dir, "ol_dump_works_2026-09-30.txt.gz"), body);
    const fetchImpl = vi.fn(async () => new Response(body));
    await ensureDump({ dir, kind: "works", date: "2026-09-30", md5: md5(body), fetchImpl });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(await readFile(join(dir, "ol_dump_works_2026-09-30.txt.gz.md5"), "utf8")).toBe(md5(body));
  });
});
