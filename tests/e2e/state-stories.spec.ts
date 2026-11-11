import { expect, test, type Page } from "@playwright/test";

test.describe("状态故事", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("covers blank records, blank week and blank projects", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "只生成一组可审阅状态样张");

    await startBlankWorkspace(page);

    await page.goto("/records");
    await expect(page.getByText("空白工作册", { exact: true })).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/phase-6-state-empty-records-1440x900.png",
      fullPage: true,
    });

    await page.goto("/week");
    await expect(
      page.getByText("这一周还没有工作记录。", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/phase-6-state-empty-week-1440x900.png",
      fullPage: true,
    });

    await page.goto("/projects");
    await expect(
      page.getByText("先建立一个项目。", { exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "docs/screenshots/phase-6-state-empty-projects-1440x900.png",
      fullPage: true,
    });
  });

  test("covers companion offline and invalid import error states", async ({
    page,
  }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "只生成一组可审阅状态样张");

    await startBlankWorkspace(page);
    await page.goto("/settings");
    await page.route("http://127.0.0.1:43817/health", (route) =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "offline" }),
      }),
    );
    await page.getByRole("button", { name: "检查本地伴侣" }).click();
    await expect(
      page.getByText("没有检测到本地伴侣。", { exact: false }),
    ).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/phase-6-state-companion-offline-1440x900.png",
      fullPage: true,
    });

    await page
      .locator('input[type="file"]')
      .nth(0)
      .setInputFiles({
        name: "invalid.json",
        mimeType: "application/json",
        buffer: Buffer.from("{not-json"),
      });
    await expect(page.getByRole("alert")).toContainText("JSON 文件无法解析");
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: "docs/screenshots/phase-6-state-import-error-1440x900.png",
      fullPage: true,
    });
  });
});

async function startBlankWorkspace(page: Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await expect(page.getByRole("button", { name: "新建记录" })).toBeVisible();
}
