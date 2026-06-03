import { defineConfig, devices } from "@playwright/test";

// Visual-regression harness (ADR 0039). Serves the unmodified production build
// and captures one full-page screenshot per key screen. Determinism lives in
// the test layer: route-mocking supplies fixed content, animations are frozen,
// and the viewport and device scale factor are pinned.
//
// Pinned: @playwright/test 1.60.0; canonical capture image
// mcr.microsoft.com/playwright:v1.60.0-jammy. See e2e/visual/README.md.
export default defineConfig({
  testDir: "e2e",
  // Single, Linux-only baseline per screen. The path carries no OS suffix so
  // baselines do not split per platform (ADR 0039: only Linux is ever captured
  // or compared). {arg} is the screenshot name passed to toHaveScreenshot.
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:4173",
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  },
  expect: {
    toHaveScreenshot: {
      // Freeze CSS animations and transitions during capture.
      animations: "disabled",
      // Zero-diff by intent (ADR 0039 threshold policy). Any non-zero value is
      // a documented, evidence-backed minimum, raised only if the canonical
      // Linux environment proves a stable sub-pixel floor. Not a comfort margin.
      maxDiffPixelRatio: 0,
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], deviceScaleFactor: 1 },
    },
  ],
  // Build the web app and serve the static bundle with `vite preview`. The
  // served build is unmodified; VITE_API_URL is left unset so the app issues
  // same-origin /api + /auth requests that the route-mock intercepts.
  webServer: {
    command:
      "pnpm --filter @unbnd/web build && pnpm --filter @unbnd/web preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
