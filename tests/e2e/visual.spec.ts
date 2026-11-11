import { expect, test } from "@playwright/test";

const viewports = [
  { width: 1440, height: 900 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 360, height: 800 },
] as const;

for (const viewport of viewports) {
  test.describe(`${viewport.width}x${viewport.height}`, () => {
    test.use({ viewport });

    test("renders the records workspace without overflow", async ({
      page,
    }, testInfo) => {
      test.skip(testInfo.project.name !== "chromium", "仅生成一组可审阅截图");

      await page.goto("/");
      await page.getByRole("button", { name: "载入演示工作册" }).click();
      await expect(
        page.getByRole("button", { name: "新建记录" }),
      ).toBeVisible();
      await page.goto("/records");

      const dimensions = await page.evaluate(() => ({
        innerWidth: window.innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        scrollHeight: document.documentElement.scrollHeight,
      }));
      expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
      expect(dimensions.scrollHeight).toBeGreaterThan(0);
      await expect(page.getByRole("heading", { name: "记录" })).toBeVisible();
      if (viewport.width <= 760) {
        const touchTargets = await page
          .locator("a:visible, button:visible")
          .evaluateAll((elements) =>
            elements.map((element) => {
              const rect = element.getBoundingClientRect();
              return {
                label: element.textContent?.trim() ?? element.tagName,
                width: rect.width,
                height: rect.height,
              };
            }),
          );
        expect(
          touchTargets.every(
            (target) => target.width >= 44 && target.height >= 44,
          ),
        ).toBe(true);
      }

      await page.screenshot({
        path: `docs/screenshots/phase-5-records-${viewport.width}x${viewport.height}.png`,
        fullPage: viewport.width >= 760,
      });
    });
  });
}
