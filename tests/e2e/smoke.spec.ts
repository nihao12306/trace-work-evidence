import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";

test("creates a record and confirms source-backed evidence", async ({
  page,
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "让工作的来路，留在结论旁边。" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "从空白开始" }).click();

  await expect(page.getByRole("heading", { name: "记录" })).toBeVisible();
  await page.getByRole("button", { name: "写下第一条记录" }).click();
  await expect(
    page.getByRole("dialog", { name: "今天发生了什么？" }),
  ).toBeVisible();
  await expect(page.locator("body")).toHaveCSS("overflow", "hidden");

  await page
    .getByLabel(/原始文字/)
    .fill("和三位新用户复查首次进入流程，所有人都在五字段表单前停顿。 ");
  await page.getByRole("button", { name: "补充细节（可选）" }).click();
  await page.getByLabel("做了什么").fill("访谈三位新用户");
  await page
    .getByLabel("遇到的问题")
    .fill("五个字段同时出现，用户不愿开始记录");
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page.locator("body")).toHaveCSS("overflow", "visible");

  await expect(
    page.getByText(
      "和三位新用户复查首次进入流程，所有人都在五字段表单前停顿。",
      { exact: true },
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: "从补充细节生成候选" }).click();
  await expect(page.getByText("待你确认")).toHaveCount(2);
  await expect(page.getByText("Trace 整理")).toHaveCount(2);
  await expect(page.getByText("它能支持什么")).toHaveCount(2);

  await page.getByRole("button", { name: "采纳这条整理" }).first().click();
  await expect(page.getByText("已确认", { exact: true })).toHaveCount(1);
  await page.locator(".evidence-confirmed summary").click();
  await expect(page.locator(".evidence-confirmed blockquote")).toBeVisible();
});

test("keeps the primary action reachable with a visible keyboard focus", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await page.evaluate(() =>
    (document.activeElement as HTMLElement | null)?.blur(),
  );
  let reachedPrimaryAction = false;
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press("Tab");
    if (
      await page
        .getByRole("button", { name: "新建记录" })
        .evaluate((element) => element === document.activeElement)
    ) {
      reachedPrimaryAction = true;
      break;
    }
  }
  expect(reachedPrimaryAction).toBe(true);
  await expect(page.getByRole("button", { name: "新建记录" })).toBeFocused();
  const focusStyle = await page
    .getByRole("button", { name: "新建记录" })
    .evaluate((element) => getComputedStyle(element).outlineStyle);
  expect(focusStyle).toBe("solid");
});

test("keeps long Chinese text and a continuous URL inside the page", async ({
  page,
}) => {
  const longText = `${"这是一段用于检查布局边界的中文工作原话。".repeat(40)}https://example.com/trace/${"x".repeat(180)}`;
  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await page.getByRole("button", { name: "新建记录" }).click();
  await page.getByLabel(/原始文字/).fill(longText);
  await page.getByRole("button", { name: "保存记录" }).click();
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
  await expect(page.locator("blockquote")).toContainText(
    "这是一段用于检查布局边界的中文工作原话。",
  );
});

test("keeps a saved record through reload and back navigation", async ({
  page,
}) => {
  const text = "这条记录需要在重载、直达和返回操作后仍然只出现一次。";
  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await page.getByRole("button", { name: "新建记录" }).click();
  await page.getByLabel(/原始文字/).fill(text);
  await page.getByRole("button", { name: "保存记录" }).click();
  await expect(page).toHaveURL(/\/records\/[^/]+$/);
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  const detailUrl = page.url();

  await page.reload();
  await expect(page.getByText(text, { exact: true })).toBeVisible();
  await page.goto("/week");
  await page.goBack();
  await expect(page).toHaveURL(detailUrl);
  await expect(page.getByText(text, { exact: true })).toBeVisible();

  await page.goto("/records");
  await expect(page.getByText(text, { exact: true })).toHaveCount(1);
});

test("turns raw text into proposed evidence without inventing a result", async ({
  page,
}) => {
  await page.goto("/");

  await page.getByRole("button", { name: "从空白开始" }).click();
  await page.getByRole("button", { name: "写下第一条记录" }).click();
  await page
    .getByLabel(/原始文字/)
    .fill(
      "今天一直在修改这个切片自动化工作台，遇到了很多问题。但是突然想通的是，假如一直跟 AI 聊不通，不妨先让他告诉我他分的原则是什么，我们从底层的规则开始聊。这样比一个一个修改上面不断冒出来的问题更好用一些。",
    );
  await page.getByRole("button", { name: "保存记录" }).click();

  await page.getByRole("button", { name: "从原始文字提炼证据表达" }).click();

  const proposedCards = page.locator(".evidence-card.evidence-proposed");
  await expect(proposedCards).toHaveCount(4);
  await expect(page.getByText("Trace 整理")).toHaveCount(4);
  await expect(page.getByText("待你确认")).toHaveCount(4);
  await expect(
    proposedCards.filter({ hasText: "正在修改这个切片自动化工作台" }),
  ).toHaveCount(1);
  await expect(
    proposedCards.filter({
      hasText: "判断这种做法比一个一个修改不断冒出的问题更好用",
    }),
  ).toHaveCount(1);
  await expect(page.getByText("结果", { exact: true })).toHaveCount(0);

  await proposedCards
    .first()
    .getByRole("button", { name: "采纳这条整理" })
    .click();
  await expect(page.locator(".evidence-confirmed")).toHaveCount(1);
  await page.locator(".evidence-confirmed summary").click();
  await expect(page.locator(".evidence-confirmed blockquote")).toBeVisible();
});

test("archives a record without deleting its original text", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await page.getByRole("button", { name: "新建记录" }).click();
  await page
    .getByLabel(/原始文字/)
    .fill("这条记录会被归档，但原文仍然要能回看。");
  await page.getByRole("button", { name: "保存记录" }).click();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "归档记录" }).click();
  await expect(page.getByRole("heading", { name: "记录" })).toBeVisible();
  await page.getByRole("button", { name: /查看已归档/ }).click();
  await expect(
    page.getByText("这条记录会被归档，但原文仍然要能回看。", { exact: true }),
  ).toBeVisible();
});

test("organizes the current week and opens an evidence-based report draft", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await page.getByRole("button", { name: "写下第一条记录" }).click();
  await page
    .getByLabel(/原始文字/)
    .fill("完成了今天的入口测试，确认用户可以先留下原话。");
  await page.getByRole("button", { name: "补充细节（可选）" }).click();
  await page.getByLabel("做了什么").fill("完成入口测试");
  await page.getByRole("button", { name: "保存记录" }).click();

  await page.getByRole("button", { name: "从补充细节生成候选" }).click();
  await page.getByRole("button", { name: "采纳这条整理" }).click();
  await expect(page.locator(".evidence-confirmed")).toHaveCount(1);

  await page.goto("/week");
  await expect(page.getByText("本周工作台", { exact: true })).toBeVisible();
  await expect(
    page.getByText("完成了今天的入口测试，确认用户可以先留下原话。", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "整理本周 / 写周报" }).click();
  await expect(
    page.getByText("证据型周报 · 草稿", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "从已确认记录整理" }).click();
  await expect(page.getByText("证据组装", { exact: true })).toBeVisible();
  await expect(
    page.locator(".report-block-content").filter({ hasText: "完成入口测试" }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: "去补充一条记录 →" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "确认这段" }).click();
  await expect(page.locator(".report-block-confirmed")).toHaveCount(1);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "定稿周报" }).click();
  await expect(
    page.getByText("证据型周报 · 已定稿", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("本版已定稿", { exact: true })).toHaveCount(8);
  await page.getByRole("button", { name: "继续修改" }).click();
  await expect(
    page.getByText("证据型周报 · 草稿", { exact: true }),
  ).toBeVisible();
  const revisionPicker = page.getByLabel("查看版本");
  await revisionPicker.selectOption({ label: "第 2 版 · 已定稿" });
  await expect(
    page.getByRole("button", { name: "回到当前修订" }),
  ).toBeVisible();
  await expect(page.getByText("本版已定稿", { exact: true })).toHaveCount(8);
  await revisionPicker.selectOption({ label: "第 3 版 · 草稿" });
  await expect(page.getByRole("button", { name: "定稿周报" })).toBeVisible();
});

test("exports a finalized case and opens its printable page", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入演示工作册" }).click();
  await expect(page.getByRole("button", { name: "新建记录" })).toBeVisible();
  await page.goto("/projects/project-interview/cases/case-study-interview");

  await expect(
    page.getByRole("heading", { name: "让人物的关键选择更早发生" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出 Markdown" }).click();
  await expect((await download).suggestedFilename()).toBe(
    "trace-case-case-study-interview.md",
  );

  await page.getByRole("button", { name: "打开打印页" }).click();
  await expect(page).toHaveURL(
    /\/projects\/project-interview\/cases\/case-study-interview\/print$/,
  );
  await expect(
    page.getByRole("button", { name: "打印 / 保存 PDF" }),
  ).toBeVisible();
  await page.emulateMedia({ media: "print" });
  await expect(page.locator(".app-sidebar")).toHaveCSS("display", "none");
  await expect(page.locator(".case-print-actions")).toHaveCSS(
    "display",
    "none",
  );
});

test("shows where confirmed evidence is already used", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "载入演示工作册" }).click();
  await expect(page.getByRole("button", { name: "新建记录" })).toBeVisible();
  await page.goto("/records/record-04");

  const usage = page.locator(".evidence-usage");
  await expect(usage).toContainText("周报 · 2026-07-20");
  await expect(usage).toContainText("项目案例 · 用户访谈内容改版");
  await expect(usage).toContainText("能力主张 · 从观看动机反推内容结构");

  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "已被引用", exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/删除前查看 .* 个引用/)).toBeVisible();
});

test("previews a local file before importing and exposes data ownership actions", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "从空白开始" }).click();
  await expect(page.getByRole("button", { name: "新建记录" })).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "备份、恢复与清空" }),
  ).toBeVisible();
  const settingsWidth = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(settingsWidth.scrollWidth).toBeLessThanOrEqual(
    settingsWidth.innerWidth,
  );

  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles({
    name: "work-notes.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify([
        {
          occurredOn: "2026-08-13",
          title: "复查入口",
          text: "我复查了新用户入口，并记录了停顿位置。",
        },
      ]),
    ),
  });
  await expect(page.getByRole("heading", { name: "导入预览" })).toBeVisible();
  await expect(page.getByText(/确认前不会写入任何本地记录/)).toBeVisible();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "确认导入" }).click();
  await expect(
    page.getByText("已导入 1 条原始记录。请逐条整理证据。", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator(".import-history-list").getByText("文件导入", { exact: true }),
  ).toBeVisible();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载本地备份" }).click();
  const backupDownload = await download;
  await expect(backupDownload.suggestedFilename()).toMatch(
    /^trace-backup-\d{4}-\d{2}-\d{2}\.json$/,
  );
  const backupPath = await backupDownload.path();
  expect(backupPath).toBeTruthy();

  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "清空本地工作册" }).click();
  await expect(
    page.getByRole("heading", { name: "让工作的来路，留在结论旁边。" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "载入演示工作册" }).click();
  await expect(page.getByRole("button", { name: "新建记录" })).toBeVisible();
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { name: "备份、恢复与清空" }),
  ).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page
    .locator('input[type="file"]')
    .nth(1)
    .setInputFiles({
      name: "trace-backup.json",
      mimeType: "application/json",
      buffer: await readFile(backupPath!),
    });
  await expect(
    page.getByText("备份已恢复，当前页面已重新读取本地工作册。", {
      exact: true,
    }),
  ).toBeVisible();
  page.once("dialog", (dialog) => void dialog.accept());
  await page.getByRole("button", { name: "移除本地副本" }).last().click();
  await expect(
    page.getByText("已移除 1 条本地导入副本。", { exact: true }),
  ).toBeVisible();
});
