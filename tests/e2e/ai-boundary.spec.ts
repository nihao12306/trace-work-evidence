import { expect, test } from "@playwright/test";

test("自定义 AI 端点发送前显示范围并可取消", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await page.getByRole("button", { name: "新建记录" }).click();
  await page
    .getByLabel(/原始文字/)
    .fill("这条内容只用于验证自定义 AI 发送边界。 ");
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page).toHaveURL(/\/records\/[^/]+$/);
  const recordUrl = page.url();

  await page.goto("/settings");
  await page.getByLabel("AI 模式").selectOption("custom_endpoint");
  await page.getByLabel(/端点地址/).fill("http://127.0.0.1:8787/trace");
  await page.getByRole("button", { name: "保存 AI 设置" }).click();
  await expect(
    page.getByText(
      "已保存自定义端点；每次发送前会先展示本次将发送的记录范围。",
      {
        exact: true,
      },
    ),
  ).toBeVisible();

  let requestCount = 0;
  await page.route("http://127.0.0.1:8787/trace", async (route) => {
    requestCount += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ proposals: [] }),
    });
  });
  await page.goto(recordUrl);
  const customButton = page.getByRole("button", {
    name: "自定义端点提议（确认发送）",
  });
  await expect(customButton).toBeVisible();

  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    expect(dialog.type()).toBe("confirm");
    dialogMessage = dialog.message();
    await dialog.dismiss();
  });
  await customButton.click();
  expect(dialogMessage).toContain("即将发送 1 条记录");
  expect(dialogMessage).toContain("这条内容只用于验证自定义 AI 发送边界");
  expect(requestCount).toBe(0);
});
