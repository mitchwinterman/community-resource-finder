import { expect, test } from "@playwright/test";
import {
  createRuntimeIssueCollector,
  expectNoHorizontalOverflow,
  installOfflineRoutes
} from "./helpers/test-helpers.js";

const staticPages = [
  { path: "/about.html", heading: "About Community Resource Finder" },
  { path: "/help.html", heading: "How to use this tool" },
  { path: "/contact.html", heading: "Contact Us" }
];

for (const pageConfig of staticPages) {
  test(`static page renders cleanly: ${pageConfig.path}`, async ({ page }) => {
    await installOfflineRoutes(page);
    const issues = createRuntimeIssueCollector(page);

    await page.goto(pageConfig.path);

    await expect(page.getByRole("heading", { name: pageConfig.heading })).toBeVisible();
    await expect(page.locator(".wrapper")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await issues.expectClean();
  });
}

test("contact page toggles suggestion-specific fields", async ({ page }) => {
  await installOfflineRoutes(page);
  const issues = createRuntimeIssueCollector(page);

  await page.goto("/contact.html");

  const extraFields = page.locator("#suggest input, #suggest textarea");
  await expect(extraFields.first()).toBeDisabled();

  await page.locator("#suggest-checkbox").check();
  await expect(extraFields.first()).toBeEnabled();

  await expectNoHorizontalOverflow(page);
  await issues.expectClean();
});
