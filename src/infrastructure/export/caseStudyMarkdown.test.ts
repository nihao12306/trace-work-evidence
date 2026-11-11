import { describe, expect, it } from "vitest";
import type {
  CaseStudy,
  CaseStudyRevision,
  Citation,
  EvidenceItem,
  OutputBlock,
  Project,
} from "../../domain/model";
import {
  buildCaseStudyMarkdown,
  buildCaseStudyPrintHtml,
} from "./caseStudyMarkdown";

const project: Project = {
  id: "project-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  schemaVersion: 1,
  name: "信息流生产管理 MVP",
  status: "active",
};

const caseStudy: CaseStudy = {
  id: "case-1",
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
  schemaVersion: 1,
  projectId: project.id,
  title: "把生产过程整理成可复查的工作台",
  rangeStart: "2026-08-01",
  rangeEnd: "2026-08-31",
  includedEvidenceIds: ["evidence-1"],
  excludedEvidenceIds: [],
  status: "finalized",
  currentRevisionId: "revision-1",
};

const revision: CaseStudyRevision = {
  id: "revision-1",
  createdAt: "2026-08-31T00:00:00.000Z",
  updatedAt: "2026-08-31T00:00:00.000Z",
  schemaVersion: 1,
  caseStudyId: caseStudy.id,
  revisionNumber: 1,
  blockIds: ["block-1", "block-2"],
  createdBy: "user",
};

const blocks: OutputBlock[] = [
  {
    id: "block-1",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    schemaVersion: 1,
    ownerKind: "case_study_revision",
    ownerId: revision.id,
    sectionKey: "background",
    order: 0,
    content: "信息分散，验证过程需要保留判断和结果。",
    epistemicKind: "user_judgment",
    reviewState: "confirmed",
    authoredBy: "user",
    citationIds: [],
  },
  {
    id: "block-2",
    createdAt: "2026-08-31T00:00:00.000Z",
    updatedAt: "2026-08-31T00:00:00.000Z",
    schemaVersion: 1,
    ownerKind: "case_study_revision",
    ownerId: revision.id,
    sectionKey: "result",
    order: 5,
    content: "完成第一轮验证。",
    epistemicKind: "observed_fact",
    reviewState: "rejected",
    authoredBy: "user",
    citationIds: ["citation-1"],
  },
];

const evidenceItems: EvidenceItem[] = [
  {
    id: "evidence-1",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    schemaVersion: 1,
    occurredOn: "2026-08-12",
    type: "action",
    statement: "完成第一轮验证流程。",
    epistemicKind: "observed_fact",
    reviewState: "confirmed",
    authoredBy: "user",
    confirmedByUser: true,
    citationIds: ["citation-1"],
  },
];

const citations: Citation[] = [
  {
    id: "citation-1",
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
    schemaVersion: 1,
    targetKind: "source_record_revision",
    targetId: "record-revision-1",
    recordId: "record-1",
    quoteSnapshot: "原始记录：完成第一轮验证流程。",
    validity: "valid",
  },
];

describe("buildCaseStudyMarkdown", () => {
  it("keeps sections, epistemic labels, evidence index, and excludes rejected blocks", () => {
    const markdown = buildCaseStudyMarkdown({
      caseStudy,
      project,
      revision,
      blocks,
      evidenceItems,
      citations,
    });

    expect(markdown).toContain("# 项目案例｜把生产过程整理成可复查的工作台");
    expect(markdown).toContain("## 背景");
    expect(markdown).toContain("**我的判断**");
    expect(markdown).toContain("## 证据索引");
    expect(markdown).toContain("完成第一轮验证流程");
    expect(markdown).toContain("原始记录：完成第一轮验证流程");
    expect(markdown).not.toContain("完成第一轮验证。");
  });

  it("escapes print HTML content", () => {
    const html = buildCaseStudyPrintHtml({
      caseStudy: { ...caseStudy, title: "<案例>" },
      project,
      revision,
      blocks: [{ ...blocks[0]!, content: "判断 < 结果" }],
      evidenceItems,
      citations,
    });

    expect(html).toContain("&lt;案例&gt;");
    expect(html).toContain("判断 &lt; 结果");
    expect(html).not.toContain("<案例>");
  });
});
