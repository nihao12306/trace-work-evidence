import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { getSourceStatus, readSourceRows } from "./sourceReaders.mjs";

const originalEnvironment = {
  TRACE_CODEX_HOME: process.env.TRACE_CODEX_HOME,
  TRACE_CODEX_SESSIONS_DIR: process.env.TRACE_CODEX_SESSIONS_DIR,
  TRACE_FEISHU_EXPORT_DIR: process.env.TRACE_FEISHU_EXPORT_DIR,
};

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("local source readers", () => {
  it("reads only user and Codex messages from session JSONL", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trace-codex-"));
    const sessions = path.join(root, "sessions");
    await fs.mkdir(sessions, { recursive: true });
    await fs.writeFile(
      path.join(sessions, "rollout.jsonl"),
      [
        JSON.stringify({
          timestamp: "2026-08-17T08:00:00.000Z",
          type: "session_meta",
          payload: { session_id: "session-1" },
        }),
        JSON.stringify({
          timestamp: "2026-08-17T08:01:00.000Z",
          type: "event_msg",
          payload: { type: "user_message", message: "完成投放复盘" },
        }),
        JSON.stringify({
          timestamp: "2026-08-17T08:02:00.000Z",
          type: "event_msg",
          payload: { type: "agent_message", message: "整理出三个问题" },
        }),
        JSON.stringify({
          timestamp: "2026-08-17T08:03:00.000Z",
          type: "response_item",
          payload: { type: "custom_tool_call", input: "不应进入原始记录" },
        }),
      ].join("\n"),
      "utf8",
    );
    process.env.TRACE_CODEX_HOME = root;
    delete process.env.TRACE_CODEX_SESSIONS_DIR;

    const result = await readSourceRows({
      provider: "codex",
      scope: "2026-08-17",
      now: new Date("2026-08-18T00:00:00.000Z"),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      externalId: "session-1",
      occurredOn: "2026-08-17",
      text: "我的请求：完成投放复盘\n\nCodex 产出：整理出三个问题",
      locator: "codex://session/session-1",
    });
  });

  it("reads explicit Feishu export files and filters by scope", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trace-feishu-"));
    await fs.writeFile(
      path.join(root, "weekly.json"),
      JSON.stringify({
        items: [
          {
            id: "doc-1",
            title: "投放复盘",
            date: "2026-08-17",
            content: "发现素材前两秒影响点击。",
          },
          {
            id: "doc-2",
            title: "无关文档",
            date: "2026-08-17",
            content: "另一份资料。",
          },
        ],
      }),
      "utf8",
    );
    process.env.TRACE_FEISHU_EXPORT_DIR = root;

    const result = await readSourceRows({
      provider: "feishu",
      scope: "投放复盘",
      now: new Date("2026-08-18T00:00:00.000Z"),
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      externalId: "doc-1",
      occurredOn: "2026-08-17",
      title: "投放复盘",
      text: "发现素材前两秒影响点击。",
    });
    expect(result.items[0]?.locator).toContain("feishu://local/");
  });

  it("marks long source material instead of silently hiding truncation", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trace-long-source-"));
    await fs.writeFile(
      path.join(root, "long.md"),
      `# 长材料\n\n${"证据".repeat(9000)}`,
      "utf8",
    );
    process.env.TRACE_FEISHU_EXPORT_DIR = root;

    const result = await readSourceRows({
      provider: "feishu",
      scope: "全部",
      now: new Date("2026-08-18T00:00:00.000Z"),
    });

    expect(result.items[0]).toMatchObject({ truncated: true });
    expect(result.items[0].text.length).toBe(16_000);
    expect(result.notices.join(" ")).toContain("只保留前段");
  });

  it("reports source readiness without exposing paths", async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "trace-status-"));
    await fs.mkdir(path.join(root, "sessions"), { recursive: true });
    process.env.TRACE_CODEX_HOME = root;
    process.env.TRACE_FEISHU_EXPORT_DIR = "";

    const status = await getSourceStatus();
    expect(status.codex).toMatchObject({ status: "ready" });
    expect(status.feishu).toMatchObject({ status: "not_configured" });
    expect(JSON.stringify(status)).not.toContain(root);
  });
});
