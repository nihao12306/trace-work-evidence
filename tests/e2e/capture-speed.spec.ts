import { expect, test } from "@playwright/test";

test("桌面最小记录三次都能在 60 秒内完成", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "只记录桌面基线");

  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await expect(page.getByRole("button", { name: "新建记录" })).toBeVisible();

  const durations: number[] = [];
  for (let index = 0; index < 3; index += 1) {
    await page.goto("/records");
    const startedAt = Date.now();
    await page.getByRole("button", { name: "写一条记录" }).click();
    await page
      .locator('textarea[placeholder*="不用先总结"]')
      .pressSequentially(
        `第 ${index + 1} 次最小记录：我完成了一次真实工作动作，并留下当时的观察。`,
        { delay: 10 },
      );
    await page.getByRole("button", { name: "保存记录" }).click();
    await expect(
      page.getByText("事情最初是这样被记下的", { exact: true }),
    ).toBeVisible();
    durations.push(Date.now() - startedAt);
  }

  expect(durations.every((duration) => duration < 60_000)).toBe(true);
  console.log(`capture baseline: ${durations.join(",")}ms`);
});
