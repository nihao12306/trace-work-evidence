import { describe, expect, it } from "vitest";
import { parseFixtureRows } from "./fixture.mjs";

describe("local companion fixture boundary", () => {
  it("filters provider-labelled rows before preview", () => {
    const rows = parseFixtureRows(
      JSON.stringify([
        {
          externalId: "feishu-1",
          provider: "feishu",
          occurredOn: "2026-08-17",
          title: "飞书文档",
          text: "一段文档内容",
        },
        {
          externalId: "codex-1",
          provider: "codex",
          occurredOn: "2026-08-17",
          title: "Codex 任务",
          text: "一段任务内容",
        },
      ]),
      { provider: "feishu", scope: "我的文档" },
    );

    expect(rows).toHaveLength(1);
    expect(rows[0]?.externalId).toBe("feishu-1");
  });

  it("infers provider from a locator and filters explicit scopes", () => {
    const rows = parseFixtureRows(
      JSON.stringify({
        items: [
          {
            externalId: "task-1",
            locator: "codex://task/task-1",
            scope: "task-1",
            occurredOn: "2026-08-17",
            title: "任务一",
            text: "完成了任务一。",
          },
          {
            externalId: "task-2",
            locator: "codex://task/task-2",
            scope: "task-2",
            occurredOn: "2026-08-17",
            title: "任务二",
            text: "完成了任务二。",
          },
        ],
      }),
      { provider: "codex", scope: "task-2" },
    );

    expect(rows.map((row) => row.externalId)).toEqual(["task-2"]);
  });

  it("rejects an explicit scope with no matching material", () => {
    expect(() =>
      parseFixtureRows(
        JSON.stringify([
          {
            externalId: "doc-1",
            provider: "feishu",
            scope: "项目文档",
            occurredOn: "2026-08-17",
            title: "文档",
            text: "内容",
          },
        ]),
        { provider: "feishu", scope: "另一个文档" },
      ),
    ).toThrow("没有找到符合本次范围");
  });
});
