import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    // Run test files in forked processes rather than worker threads. The
    // route suites spin ephemeral supertest HTTP servers per file; under the
    // threads pool at full-suite load on macOS this intermittently produced
    // client-side "Parse Error: Expected HTTP/" transport failures (observed
    // at the #79 and #84 post-merge gates, ~1 in 3 full runs, always green
    // in isolation and on Linux CI). Process isolation removes the shared-
    // runtime socket contention; measured clean across repeated full runs.
    pool: "forks",
    // Load headroom: a route test hit the 5s default under heavy parallel
    // local load at the #90 gate (isolation-green; a different, milder class
    // than the retired transport flake). Generous but finite.
    testTimeout: 15000,
  },
});
