import { expect, test, type Page } from "@playwright/test";

async function loadDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "载入演示工作册" }).click();
  await expect(page.getByRole("button", { name: "新建记录" })).toBeVisible();
}

test.describe("发布说明截图", () => {
  test.describe("桌面工作台与数据边界", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("captures the populated weekly workbench", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");
      await loadDemo(page);
      await page.goto("/week?weekStart=2026-07-20&weekEnd=2026-07-26");
      await expect(
        page.getByText("用户访谈内容改版", { exact: true }),
      ).toBeVisible();
      await page.screenshot({
        path: "docs/screenshots/phase-5-week-1440x900.png",
        fullPage: true,
      });
    });

    test("captures the source boundary center", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");
      await loadDemo(page);
      await page.goto("/settings");
      await expect(
        page.getByRole("heading", { name: "数据来源中心" }),
      ).toBeVisible();
      await page.screenshot({
        path: "docs/screenshots/phase-5-settings-1440x900.png",
        fullPage: true,
      });
    });

    test("captures the career evidence brief", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");
      await loadDemo(page);
      await page.goto("/career");
      await expect(
        page.getByRole("heading", {
          name: "先从经历里找方向，再判断你想去哪里。",
        }),
      ).toBeVisible();
      await page.screenshot({
        path: "docs/screenshots/phase-7-career-1440x900.png",
        fullPage: true,
      });
    });

    test("captures the editable evidence report", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");
      await loadDemo(page);
      await page.goto("/week/report?weekStart=2026-07-20&weekEnd=2026-07-26");
      const continueButton = page.getByRole("button", { name: "继续修改" });
      await expect(continueButton).toBeVisible({ timeout: 15000 });
      await continueButton.click();
      await expect(
        page.getByText("证据型周报 · 草稿", { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".report-block").first()).toBeVisible();
      await page.screenshot({
        path: "docs/screenshots/phase-5-report-1440x900.png",
        fullPage: true,
      });
    });

    test("captures the printable weekly report", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");
      await loadDemo(page);
      await page.goto("/week/report?weekStart=2026-07-20&weekEnd=2026-07-26");
      await expect(
        page.getByRole("button", { name: "打印 / 保存 PDF" }),
      ).toBeVisible({ timeout: 15000 });
      await page.emulateMedia({ media: "print" });
      await expect(page.locator(".app-sidebar")).toHaveCSS("display", "none");
      await page.screenshot({
        path: "docs/screenshots/phase-5-report-print-1440x900.png",
        fullPage: true,
      });
    });

    test("captures the printable project case", async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");
      await loadDemo(page);
      await page.goto(
        "/projects/project-interview/cases/case-study-interview/print",
      );
      await expect(
        page.getByRole("button", { name: "打印 / 保存 PDF" }),
      ).toBeVisible();
      await page.emulateMedia({ media: "print" });
      await expect(page.locator(".app-sidebar")).toHaveCSS("display", "none");
      await page.screenshot({
        path: "docs/screenshots/phase-5-case-print-1440x900.png",
        fullPage: true,
      });
    });
  });

  test.describe("手机周报编辑", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("captures the report editor on a narrow viewport", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");
      await loadDemo(page);
      await page.goto("/week/report?weekStart=2026-07-20&weekEnd=2026-07-26");
      const continueButton = page.getByRole("button", { name: "继续修改" });
      await expect(continueButton).toBeVisible({ timeout: 15000 });
      await continueButton.click();
      await expect(
        page.getByText("证据型周报 · 草稿", { exact: true }),
      ).toBeVisible();
      await expect(page.locator(".report-block").first()).toBeVisible();
      await page.screenshot({
        path: "docs/screenshots/phase-5-report-390x844.png",
        fullPage: false,
      });
    });

    test("captures the career brief on a narrow viewport", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");
      await loadDemo(page);
      await page.goto("/career");
      await expect(
        page.getByRole("heading", {
          name: "先从经历里找方向，再判断你想去哪里。",
        }),
      ).toBeVisible();
      await page.screenshot({
        path: "docs/screenshots/phase-7-career-390x844.png",
        fullPage: false,
      });
    });
  });
});
