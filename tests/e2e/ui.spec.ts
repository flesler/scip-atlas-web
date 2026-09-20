import { expect, test } from "@playwright/test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { buildExplorerDb } from "../../bin/pack/build.js"

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "../fixtures");

function buildFixtureDb(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "scip-atlas-web-e2e-"));
  const output = path.join(dir, "explorer.db");
  buildExplorerDb({
    repoPath: FIXTURE_DIR,
    indexPath: path.join(FIXTURE_DIR, "index.db"),
    atlasPath: path.join(FIXTURE_DIR, "atlas.db"),
    outputPath: output,
  });
  return output;
}

test("loads explorer.db and navigates tree without errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  const dbPath = buildFixtureDb();
  await page.goto("/");
  await page.locator("#db-input").setInputFiles(dbPath);
  await expect(page.locator("#status")).toContainText("explorer.db");

  const treeRows = page.locator(".tree-row");
  await expect(treeRows.first()).toBeVisible();

  const srcRow = page.locator(".tree-row").filter({ hasText: "src" });
  await srcRow.click();
  await expect(page.locator(".tree-children .tree-row").first()).toBeVisible();
  await expect(page.locator("#detail-panel h2")).toContainText("src");

  const helper = page.locator(".tree-row", { hasText: "helper.ts" }).first();
  await helper.click();
  await expect(page.locator("#detail-panel h2")).toContainText("helper.ts");
  await expect(page.locator(".error")).toHaveCount(0);
  expect(errors.filter((message) => message.includes("too much recursion"))).toEqual([]);
});

test("db view lists tables and shows NULL cells for nullable columns", async ({ page }) => {
  const dbPath = buildFixtureDb();
  await page.goto("/");
  await page.locator("#db-input").setInputFiles(dbPath);
  await page.locator("#view-db").click();
  await expect(page.locator(".db-table-row", { hasText: "files" })).toBeVisible();
  await page.locator(".db-table-row", { hasText: "files" }).click();
  await expect(page.locator(".data-table td.null-cell").first()).toContainText("NULL");
  await expect(page.getByRole("columnheader", { name: "summary", exact: true })).toBeVisible();
});

test("search opens a hit and navigates to file", async ({ page }) => {
  const dbPath = buildFixtureDb();
  await page.goto("/");
  await page.locator("#db-input").setInputFiles(dbPath);
  await expect(page.locator(".tree-row").first()).toBeVisible();
  await page.locator("#search-input").fill("helper");
  await page.locator("#search-input").press("Enter");
  await expect(page.locator(".search-results button").first()).toBeVisible();
  await page.locator(".search-results button").first().click();
  await expect(page.locator("#detail-panel h2")).toContainText("helper.ts");
});
