import { expect, test } from "@playwright/test";

test("saves career context and downloads a source-backed career brief", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入演示工作册" }).click();
  await page.getByRole("link", { name: "求职", exact: true }).click();

  await expect(
    page.getByRole("heading", {
      name: "先从经历里找方向，再判断你想去哪里。",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "根据现有证据，你可能能做的岗位" }),
  ).toBeVisible();
  await expect(page.getByText("内容策略 / 内容运营")).toBeVisible();
  await page
    .getByLabel("当前岗位与主要职责（可选背景）")
    .fill("内容运营，负责选题、投放复盘和跨团队推进。");
  await page
    .getByLabel("对系统推导方向的反馈（可选）")
    .fill("内容策略更感兴趣；暂不考虑纯投放岗位。");
  await page
    .getByLabel("希望下一份工作增加什么")
    .fill("更多策略判断和完整项目责任。");
  await page.getByRole("button", { name: "保存筛选条件" }).click();
  await expect(page.getByRole("status")).toContainText("筛选条件已保存");

  await page.reload();
  await expect(page.getByLabel("当前岗位与主要职责（可选背景）")).toHaveValue(
    "内容运营，负责选题、投放复盘和跨团队推进。",
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载岗位方向分析包" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(
    /^trace-career-direction-analysis-.*\.md$/u,
  );
});

test("scans authorized local work sources and turns them into reviewable evidence", async ({
  page,
}) => {
  await page.route("http://127.0.0.1:43817/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === "/health") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          protocol: "trace-local-companion",
          protocolVersion: 1,
          companionVersion: "0.3.0",
          status: "ready",
          capabilities: ["health", "preview_import", "confirm_import"],
          sources: {
            codex: { status: "ready", label: "Codex 会话" },
            feishu: { status: "not_configured", label: "飞书本地目录" },
          },
        }),
      });
      return;
    }
    if (url.pathname === "/v1/import/preview") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          protocol: "trace-local-companion",
          protocolVersion: 1,
          previewId: "career-preview",
          provider: "codex",
          scopeSummary: "Codex · 最近365天",
          selectedCount: 2,
          items: [
            {
              externalId: "career-session-1",
              occurredOn: "2026-08-10",
              title: "用户访谈与内容结构",
              text: "完成了 6 次用户访谈。决定重组内容开头和信息顺序。",
              locator: "codex://session/career-session-1",
            },
            {
              externalId: "career-session-2",
              occurredOn: "2026-08-12",
              title: "新版内容测试复盘",
              text: "测试新版内容，前 30 秒完成观看率提升到 56%。编辑反馈新版更容易理解。",
              locator: "codex://session/career-session-2",
            },
          ],
          notices: [],
          expiresAt: "2099-08-12T08:10:00.000Z",
        }),
      });
      return;
    }
    if (url.pathname === "/v1/import/confirm") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          protocol: "trace-local-companion",
          protocolVersion: 1,
          previewId: "career-preview",
          status: "confirmed",
          selectedCount: 2,
        }),
      });
      return;
    }
    await route.abort();
  });

  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await page.getByRole("link", { name: "求职", exact: true }).click();
  await page.getByRole("button", { name: "自动扫描工作记录" }).click();

  await expect(page.getByText("用户访谈与内容结构")).toBeVisible();
  await expect(page.getByText("新版内容测试复盘")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("初步找到 2 条");

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "导入并整理 2 条" }).click();
  await expect(
    page.getByRole("heading", { name: "自动找到的工作成果与行动" }),
  ).toBeVisible();

  const confirmButtons = page.getByRole("button", { name: "确认属实" });
  let remaining = await confirmButtons.count();
  while (remaining > 0) {
    await confirmButtons
      .first()
      .evaluate((button: HTMLButtonElement) => button.click());
    remaining -= 1;
    await expect(confirmButtons).toHaveCount(remaining);
  }
  await expect(page.getByText("用户研究 / 内容研究")).toBeVisible();
});
