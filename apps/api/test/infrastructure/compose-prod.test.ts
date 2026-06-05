import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(__dirname, "..", "..", "..", "..");
const compose = () =>
  readFileSync(resolve(REPO_ROOT, "docker-compose.prod.yml"), "utf8");

// Every Unbnd-built image (ghcr.io/aburra16/unbnd-*) must carry the
// ${UNBND_IMAGE_TAG...} variable in its tag, so the deploy's persisted SHA
// (see .github/workflows/staging.yml + ADR 0060) drives both the always-on
// stack and any by-hand profile-worker `run`. A hardcoded tag would reintroduce
// the stale-:latest drift the deploy persistence closes.
//
// The data-layer image is externally pinned (built from a pinned upstream
// Tapestry commit) and stays :latest by design — excluded, alongside the
// third-party postgres/meilisearch images, which never match the unbnd- prefix.
describe("docker-compose.prod.yml image tags", () => {
  it("tags every ghcr.io/aburra16/unbnd-* app image with ${UNBND_IMAGE_TAG}", () => {
    const lines = compose().split("\n");
    const appImages = lines
      .map((line) => line.trim())
      .filter((line) => line.startsWith("image: ghcr.io/aburra16/unbnd-"))
      // The data-layer is externally pinned (own upstream version), excluded.
      .filter((line) => !line.includes("unbnd-tapestry-data-layer"));

    // Guard the guard: the prefix must actually match some app images, or a
    // rename would silently turn this assertion into a no-op.
    expect(appImages.length).toBeGreaterThan(0);

    for (const line of appImages) {
      expect(line, line).toContain("${UNBND_IMAGE_TAG");
    }
  });
});
