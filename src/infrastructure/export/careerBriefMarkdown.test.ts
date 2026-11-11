import { describe, expect, it } from "vitest";
import { buildCareerBriefMarkdown } from "./careerBriefMarkdown";
import type { CareerBriefExportInput } from "./careerBriefMarkdown";

describe("career brief markdown", () => {
  it("exports only confirmed evidence and keeps source excerpts", () => {
    const base = {
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      schemaVersion: 1,
    };
    const input: CareerBriefExportInput = {
      projects: [
        { ...base, id: "project-1", name: "增长项目", status: "active" },
      ],
      evidenceItems: [
        {
          ...base,
          id: "evidence-1",
          projectId: "project-1",
          occurredOn: "2026-08-30",
          type: "result",
          statement: "将关键流程耗时降低到原来的一半。",
          epistemicKind: "observed_fact",
          reviewState: "confirmed",
          authoredBy: "user",
          confirmedByUser: true,
          citationIds: ["citation-1"],
        },
        {
          ...base,
          id: "evidence-2",
          occurredOn: "2026-08-31",
          type: "result",
          statement: "尚未确认的夸张结果。",
          epistemicKind: "ai_inference",
          reviewState: "proposed",
          authoredBy: "ai",
          confirmedByUser: false,
          citationIds: [],
        },
      ],
      citations: [
        {
          ...base,
          id: "citation-1",
          targetKind: "source_record_revision",
          targetId: "revision-1",
          quoteSnapshot: "上线后处理时间从 4 小时降到 2 小时。",
          validity: "valid",
        },
      ],
      caseStudies: [],
      caseStudyRevisions: [],
      outputBlocks: [],
      capabilityClaims: [],
    };

    const markdown = buildCareerBriefMarkdown(input);

    expect(markdown).toContain("将关键流程耗时降低到原来的一半");
    expect(markdown).toContain("上线后处理时间从 4 小时降到 2 小时");
    expect(markdown).not.toContain("尚未确认的夸张结果");
    expect(markdown).toContain("已确认经历的重复信号还不足以推导岗位方向");
  });
});
