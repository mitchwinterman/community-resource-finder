import { expect, test } from "@playwright/test";
import {
  createRuntimeIssueCollector,
  expectNoHorizontalOverflow,
  expectResponsiveMainPanels,
  installOfflineRoutes
} from "./helpers/test-helpers.js";

test("admin portal loads seeded data for an authenticated admin", async ({ page }) => {
  await installOfflineRoutes(page, {
    auth: {
      currentUser: { uid: "admin-1", email: "admin@example.org" }
    }
  });
  const issues = createRuntimeIssueCollector(page);

  await page.goto("/admin.html");

  await expect(page.locator("#admin-screen")).toBeVisible();
  await expect(page.locator(".nav-btn")).toHaveCount(7);

  await page.getByRole("button", { name: "Edit Resources" }).click();
  await expect(page.locator("#panel-resources")).toBeVisible();
  await expect(page.locator("#resource-list .list-row").first()).toBeVisible();

  await page.locator("#resource-list .list-row").first().click();
  await expect(page.locator("#resource-editor")).toBeVisible();
  await expect(page.locator(".quill-field")).toHaveCount(2);

  await expectResponsiveMainPanels(page);
  await expectNoHorizontalOverflow(page);
  await issues.expectClean();
});

test("organization portal loads member-owned resources and request history", async ({ page }) => {
  await installOfflineRoutes(page, {
    auth: {
      currentUser: { uid: "member-1", email: "editor@foodbank.example.org" }
    }
  });
  const issues = createRuntimeIssueCollector(page);

  await page.goto("/org.html");

  await expect(page.locator("#org-screen")).toBeVisible();
  await expect(page.locator("#resource-list .list-row")).toHaveCount(2);
  await expect(page.locator("#request-list")).toContainText("Downtown Food Pantry");

  await page.locator("#resource-list .list-row").first().click();
  await expect(page.locator("#resource-editor")).toBeVisible();
  await expect(page.locator(".quill-field")).toHaveCount(2);

  await expectResponsiveMainPanels(page);
  await expectNoHorizontalOverflow(page);
  await issues.expectClean();
});

test("quarterly review page loads a tokenized listing and confirms it", async ({ page }) => {
  await installOfflineRoutes(page);
  const issues = createRuntimeIssueCollector(page);

  await page.goto("/review.html?token=review-token-1");

  await expect(page.locator("#review-page-title")).toContainText("Downtown Food Pantry");
  await expect(page.locator("#review-details")).toContainText("Northern Nevada Food Bank");

  await page.locator("#confirm-review-btn").click();
  await expect(page.locator("#review-message")).toContainText("Thanks");
  await expect(page.locator("#confirm-review-btn")).toBeDisabled();

  await expectNoHorizontalOverflow(page);
  await issues.expectClean();
});
