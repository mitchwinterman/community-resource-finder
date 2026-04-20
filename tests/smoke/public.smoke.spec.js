import { expect, test } from "@playwright/test";
import {
  createRuntimeIssueCollector,
  expectNoHorizontalOverflow,
  expectResponsiveMainPanels,
  installOfflineRoutes
} from "./helpers/test-helpers.js";

test("public directory supports core browse, filter, and map flows", async ({ page }) => {
  await installOfflineRoutes(page);
  const issues = createRuntimeIssueCollector(page);

  await page.goto("/index.html");

  await expect(page.locator("#results .result-card")).toHaveCount(3);
  await expect(page.locator("#resultCount")).toContainText("3");
  await expectResponsiveMainPanels(page);
  await expectNoHorizontalOverflow(page);

  await page.locator("#searchBox").fill("shelter");
  await expect(page.locator("#results .result-card")).toHaveCount(1);

  await page.locator("#resetButton").click();
  await expect(page.locator("#results .result-card")).toHaveCount(3);

  await page.locator("#categorySelect").selectOption({ label: "Housing" });
  await expect(page.locator("#subcategorySelect")).toBeEnabled();
  await page.locator("#subcategorySelect").selectOption({ label: "Emergency Shelter" });
  await expect(page.locator("#results .result-card")).toHaveCount(1);

  await page.locator("#results .result-card").first().click();
  await expect(page.locator(".details-title")).toContainText("Family Shelter Intake");

  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 900) {
    await expect(page.locator("#mobileBackToResultsBtn")).toBeVisible();
    await page.locator("#mobileBackToResultsBtn").click();
    await expect(page.locator("#mobileBackToResultsBtn")).toBeHidden();
    await page.locator("#results .result-card").first().click();
  }

  await page.locator("#mapViewToggle").click();
  await expect(page.locator(".leaflet-map-canvas")).toBeVisible();

  await page.locator("#resultsScopeToggle").click();
  await expect(page.locator(".leaflet-map-canvas")).toBeVisible();

  await page.locator("#detailsViewToggle").click();
  await expect(page.locator(".details-card, .details-section").first()).toBeVisible();

  await issues.expectClean();
});
