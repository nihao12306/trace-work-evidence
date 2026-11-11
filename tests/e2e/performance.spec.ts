import { test, expect } from "@playwright/test";
import { demoData } from "../../src/fixtures/demoData";

test("10 倍演示记录仍能打开记录列表和本周工作台", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "性能基线只在 Chromium 记录，避免重复测量设备差异",
  );
  await page.goto("/");
  await page.getByRole("button", { name: "载入演示工作册" }).click();
  await expect(page.getByRole("button", { name: "新建记录" })).toBeVisible();

  const performanceRows = Array.from({ length: 9 }, (_, copyIndex) =>
    demoData.sourceRecords.map((record) => ({
      ...record,
      id: `${record.id}-performance-${copyIndex + 1}`,
      currentRevisionId: `${record.id}-performance-${copyIndex + 1}-revision-1`,
    })),
  ).flat();
  const performanceRevisions = performanceRows.map((record) => ({
    id: record.currentRevisionId,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    schemaVersion: record.schemaVersion,
    recordId: record.id,
    revisionNumber: 1,
    text: record.originalText,
    author: "user" as const,
  }));

  await page.evaluate(
    async ({ records, revisions }) => {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open("trace-work-evidence-v1");
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(
          ["sourceRecords", "recordRevisions"],
          "readwrite",
        );
        const sourceRecords = transaction.objectStore("sourceRecords");
        const recordRevisions = transaction.objectStore("recordRevisions");
        records.forEach((record) => sourceRecords.put(record));
        revisions.forEach((revision) => recordRevisions.put(revision));
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
      database.close();
    },
    { records: performanceRows, revisions: performanceRevisions },
  );

  const recordStartedAt = Date.now();
  await page.goto("/records");
  await expect(page.locator(".record-row")).toHaveCount(
    demoData.sourceRecords.length * 10,
  );
  const recordOpenMs = Date.now() - recordStartedAt;

  const weekStartedAt = Date.now();
  await page.goto("/week?weekStart=2026-07-20&weekEnd=2026-07-26");
  await expect(page.getByText("本周工作台", { exact: true })).toBeVisible();
  const weekOpenMs = Date.now() - weekStartedAt;

  expect(recordOpenMs).toBeLessThan(3000);
  expect(weekOpenMs).toBeLessThan(3000);
  console.log(
    `10x performance baseline: records=${recordOpenMs}ms, week=${weekOpenMs}ms`,
  );
});
