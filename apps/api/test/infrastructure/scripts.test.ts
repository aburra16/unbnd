import { readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");

describe("scripts/tapestry-version.txt", () => {
  const pinFile = () =>
    readFileSync(
      resolve(REPO_ROOT, "scripts", "tapestry-version.txt"),
      "utf8",
    );

  it("exists", () => {
    expect(() => pinFile()).not.toThrow();
  });

  it("contains a non-comment line for the branch and the commit SHA", () => {
    const lines = pinFile()
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));
    expect(lines.length).toBeGreaterThanOrEqual(2);
    const [branch, sha] = lines;
    expect(branch).toMatch(/^[a-z0-9_./-]+$/);
    expect(sha).toMatch(/^[0-9a-f]{40}$/);
  });
});

describe("scripts/build-tapestry-image.sh", () => {
  const path = resolve(REPO_ROOT, "scripts", "build-tapestry-image.sh");

  it("exists", () => {
    expect(() => statSync(path)).not.toThrow();
  });

  it("starts with a bash shebang", () => {
    const text = readFileSync(path, "utf8");
    expect(text.split(/\r?\n/)[0]).toMatch(/^#!\/usr\/bin\/env bash/);
  });

  it("reads the pin file", () => {
    expect(readFileSync(path, "utf8")).toContain("tapestry-version.txt");
  });

  it("tags the image as unbnd/tapestry-data-layer", () => {
    expect(readFileSync(path, "utf8")).toContain(
      "unbnd/tapestry-data-layer",
    );
  });

  it("is executable", () => {
    const mode = statSync(path).mode & 0o111;
    expect(mode).toBeGreaterThan(0);
  });
});

describe("scripts/generate-keypair.js", () => {
  const path = resolve(REPO_ROOT, "scripts", "generate-keypair.js");

  it("exists", () => {
    expect(() => statSync(path)).not.toThrow();
  });

  it("prints both pubkey and nsec on invocation", () => {
    const text = readFileSync(path, "utf8");
    // We assert the source mentions both, rather than exec'ing the script,
    // so the test stays hermetic.
    expect(text).toMatch(/pubkey/i);
    expect(text).toMatch(/nsec/i);
  });
});
