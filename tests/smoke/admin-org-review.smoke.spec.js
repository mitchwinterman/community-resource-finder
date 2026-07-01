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

test("admin approval blocks requests targeting another organization's resource", async ({ page }) => {
  await installOfflineRoutes(page, {
    auth: {
      currentUser: { uid: "admin-1", email: "admin@example.org" }
    },
    collections: {
      resource_change_requests: {
        "req-cross-org": {
          organizationId: "org-1",
          resourceId: "res-2",
          resourceName: "Cross-Org Rename",
          requestType: "resource_edit",
          status: "pending",
          submittedByUid: "member-1",
          submittedByEmail: "editor@foodbank.example.org",
          submitterNotes: "This should be blocked.",
          reviewNotes: "",
          proposedData: {
            resourceTitle: "Unsafe Rename",
            Description: "<p>Should not be applied.</p>",
            Website: "",
            Phone: ""
          }
        }
      }
    }
  });
  const issues = createRuntimeIssueCollector(page);
  const dialogs = [];
  page.on("dialog", async dialog => {
    dialogs.push(dialog.message());
    await dialog.accept();
  });

  await page.goto("/admin.html");
  await expect(page.locator("#admin-screen")).toBeVisible();

  await page.getByRole("button", { name: "Review Requests" }).click();
  await expect(page.locator("#request-list")).toContainText("Cross-Org Rename");

  await page.locator("#request-list .list-row", { hasText: "Cross-Org Rename" }).click();
  await page.locator("#approve-request-btn").click();

  await expect.poll(() => dialogs.join("\n")).toContain("Cannot approve");

  const blockedState = await page.evaluate(() => ({
    targetResourceTitle: window.__CRF_TEST_STATE__.collections.resources["res-2"].resourceTitle,
    requestStatus: window.__CRF_TEST_STATE__.collections.resource_change_requests["req-cross-org"].status
  }));

  expect(blockedState.targetResourceTitle).toBe("Family Shelter Intake");
  expect(blockedState.requestStatus).toBe("pending");

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
