import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadCheckpoint } from "../src/checkpoint";

const dirs: string[] = [];
function tmpFile() {
  const dir = mkdtempSync(join(tmpdir(), "seed-cp-"));
  dirs.push(dir);
  return join(dir, "checkpoint");
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("loadCheckpoint", () => {
  it("records and reports completed slugs", () => {
    const cp = loadCheckpoint(tmpFile());
    expect(cp.has("ol-a")).toBe(false);
    cp.add("ol-a");
    cp.add("ol-b");
    expect(cp.has("ol-a")).toBe(true);
    expect(cp.size()).toBe(2);
  });

  it("persists across reload (resumable)", () => {
    const path = tmpFile();
    const cp1 = loadCheckpoint(path);
    cp1.add("ol-x");
    cp1.add("ol-y");
    const cp2 = loadCheckpoint(path);
    expect(cp2.has("ol-x")).toBe(true);
    expect(cp2.has("ol-y")).toBe(true);
    expect(cp2.size()).toBe(2);
  });

  it("does not double-count a re-added slug", () => {
    const cp = loadCheckpoint(tmpFile());
    cp.add("ol-z");
    cp.add("ol-z");
    expect(cp.size()).toBe(1);
  });
});
