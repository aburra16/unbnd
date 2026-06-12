// Visual-regression specs (ADR 0039). One test per key screen. Each route-mocks
// the /api + /auth fan-out with signed-out fixtures, navigates, waits for a
// content sentinel that proves the ready state rendered (never the loading or
// error state), then captures a full-page screenshot against the committed
// Linux baseline.
//
// Baselines are generated and updated only inside the pinned Playwright Docker
// image. See README.md for the canonical capture command.
import { test, expect } from "@playwright/test";
import { mockApi, FIXTURE_NPUB } from "./fixtures";

test.describe("visual regression", () => {
  test("home", async ({ page }) => {
    await mockApi(page, { auth: "signed-out" });
    await page.goto("/");
    // Ready-state sentinel: the "Recently added" shelf renders only after the
    // catalog load resolves. The loading/error states show `.route-status`.
    await expect(
      page.locator(".shelf-title", { hasText: "Recently added" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("home.png", { fullPage: true });
  });

  test("book detail", async ({ page }) => {
    await mockApi(page, { auth: "signed-out" });
    await page.goto("/book/the-fixture-novel");
    // Ready-state sentinel: the book title heading. The loading state renders
    // only `.route-status`; not-found renders the NotFound screen.
    await expect(
      page.locator(".bh-title", { hasText: "The Fixture Novel" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("book-detail.png", { fullPage: true });
  });

  test("profile", async ({ page }) => {
    await mockApi(page, { auth: "signed-out" });
    await page.goto(`/profile/${FIXTURE_NPUB}`);
    // Ready-state sentinel: the resolved display name. An unresolvable npub
    // renders NotFound instead.
    await expect(
      page.locator(".me-name", { hasText: "Fixture Curator" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("profile.png", { fullPage: true });
  });

  test("search", async ({ page }) => {
    await mockApi(page, { auth: "signed-out" });
    await page.goto("/search?q=fixture");
    // Ready-state sentinel: the result count line, rendered only on the ready
    // state. The loading state shows "Searching…", error shows an alert.
    await expect(page.locator(".search-count")).toBeVisible();
    await expect(page).toHaveScreenshot("search.png", { fullPage: true });
  });

  test("auth welcome", async ({ page }) => {
    await mockApi(page, { auth: "signed-out" });
    await page.goto("/auth/welcome");
    // Static content; the auth card title is unconditional.
    await expect(
      page.locator(".auth-card-title", { hasText: "You're in" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("auth-welcome.png", { fullPage: true });
  });

  test("submit", async ({ page }) => {
    // Story 64 / ADR 0063 §5: drive the harness INTO the populated form so the
    // baseline captures the autofill affordance + cover preview. Signed-in so the
    // submit affordances render in the real interactive state; the OL lookup is
    // mocked (OL_LOOKUP) so the debounced autofill resolves deterministically.
    await mockApi(page, { auth: "signed-in" });
    await page.goto("/submit");
    // Search-first: type a query, then proceed past the duplicate check.
    await page
      .getByLabel("Search the catalog for an existing book")
      .fill("The Fixture Novel");
    await page
      .getByRole("button", { name: /Add it anyway|Add this book/i })
      .first()
      .click();
    // Enter a valid ISBN to trigger the debounced OL lookup → autofill.
    await page.locator("#sub-isbn13").fill("9780140328721");
    // Ready-state sentinel: the autofill affordance proves the lookup resolved
    // and the empty fields were filled. The preview renders the gradient fallback
    // (the mocked cover URL resolves to JSON, so the <img> errors out).
    await expect(
      page.locator(".sub-autofill-note", { hasText: "Filled from Open Library" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("submit.png", { fullPage: true });
  });

  test("guide section", async ({ page }) => {
    // Story 94: the first capture of the guide surface — the docs tree, the
    // 66ch measure, and the site chrome (Story 93) together. Guide content is
    // bundled and static, deterministic by construction; the mock fan-out only
    // feeds the chrome.
    await mockApi(page, { auth: "signed-out" });
    await page.goto("/guide/ratings-you-can-trust");
    await expect(
      page.locator(".guide-title", { hasText: "Ratings you can trust" }),
    ).toBeVisible();
    await expect(page).toHaveScreenshot("guide-section.png", { fullPage: true });
  });
});
