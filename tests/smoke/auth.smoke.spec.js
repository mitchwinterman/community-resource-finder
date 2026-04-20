import { expect, test } from "@playwright/test";
import {
  createRuntimeIssueCollector,
  expectNoHorizontalOverflow,
  installOfflineRoutes
} from "./helpers/test-helpers.js";

test("login page validates empty forgot-password flow", async ({ page }) => {
  await installOfflineRoutes(page);
  const issues = createRuntimeIssueCollector(page);

  await page.goto("/login.html");

  await page.locator("#forgotPasswordBtn").click();
  await expect(page.locator("#login-error")).toContainText("Enter your email address first");
  await expectNoHorizontalOverflow(page);
  await issues.expectClean();
});

test("password reset page renders form and validates confirmation", async ({ page }) => {
  await installOfflineRoutes(page);
  const issues = createRuntimeIssueCollector(page);

  await page.goto("/auth.html?mode=resetPassword&oobCode=demo-code");

  await expect(page.locator("#auth-action-form")).toBeVisible();
  await page.locator("#new-password").fill("new-password");
  await page.locator("#confirm-password").fill("different-password");
  await page.locator("#resetPasswordBtn").click();

  await expect(page.locator("#auth-action-error")).toContainText("does not match");
  await expectNoHorizontalOverflow(page);
  await issues.expectClean();
});
