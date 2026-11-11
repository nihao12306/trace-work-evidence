import { describe, expect, it } from "vitest";
import type { Citation, OutputBlock } from "../../domain/model";
import { buildWeeklyMarkdown } from "./weeklyMarkdown";

const citation: Citation = {
  id: "citation-1",
  createdAt: "2026-08-12T00:00:00.000Z",
  updatedAt: "2026-08-12T00:00:00.000Z",
  schemaVersion: 1,
  targetKind: "source_record_revision",
  targetId: "revision-1",
  recordId: "record-1",
  quoteSnapshot: "完成了入口测试。",
  validity: "valid",
};

function block(overrides: Partial<OutputBlock>): OutputBlock {
  return {
    id: "block-1",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    schemaVersion: 1,
    ownerKind: "weekly_review_revision",
    ownerId: "review-revision-1",
    sectionKey: "focus",
    order: 0,
    content: "完成入口测试。",
    epistemicKind: "observed_fact",
    reviewState: "confirmed",
    authoredBy: "user",
    citationIds: [citation.id],
    ...overrides,
  };
}

describe("buildWeeklyMarkdown", () => {
  it("keeps section structure, source index and pending labels", () => {
    const markdown = buildWeeklyMarkdown({
      weekStart: "2026-08-10",
      weekEnd: "2026-08-16",
      blocks: [
        block({}),
        block({
          id: "block-2",
          sectionKey: "results",
          content: "可能会提高完成率。",
          epistemicKind: "hypothesis",
          reviewState: "proposed",
        }),
        block({
          id: "block-3",
          sectionKey: "inferred_causes",
          content: "可能是入口信息过多导致停顿。",
          epistemicKind: "ai_inference",
        }),
        block({
          id: "block-4",
          sectionKey: "focus",
          content: "这条被拒绝的内容不应导出。",
          reviewState: "rejected",
        }),
      ],
      citations: [citation],
    });

    expect(markdown).toContain("# 工作周报｜2026-08-10 — 2026-08-16");
    expect(markdown).toContain("## 本周重点工作");
    expect(markdown).toContain("**待验证假设（待确认）** 可能会提高完成率。");
    expect(markdown).toContain("**已确认事实** 完成入口测试。");
    expect(markdown).toContain("**AI 推测** 可能是入口信息过多导致停顿。");
    expect(markdown).not.toContain("这条被拒绝的内容不应导出");
    expect(markdown).toContain("## 证据索引");
    expect(markdown).toContain("完成了入口测试。");
  });
});
