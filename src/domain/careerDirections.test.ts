import { describe, expect, it } from "vitest";
import type { CapabilityClaim, EvidenceItem, Project } from "./model";
import { inferCareerDirections } from "./careerDirections";

const project: Project = {
  id: "project-1",
  name: "访谈内容改版",
  description: "重新设计视频叙事结构并测试受众反馈。",
  status: "completed",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  schemaVersion: 1,
};

function evidence(
  id: string,
  type: EvidenceItem["type"],
  statement: string,
  reviewState: EvidenceItem["reviewState"] = "confirmed",
): EvidenceItem {
  return {
    id,
    projectId: project.id,
    occurredOn: "2026-01-02",
    type,
    statement,
    epistemicKind: "observed_fact",
    reviewState,
    authoredBy: "user",
    confirmedByUser: reviewState === "confirmed",
    citationIds: [`citation-${id}`],
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    schemaVersion: 1,
  };
}

describe("career direction inference", () => {
  it("derives role families from multiple confirmed experiences and keeps their ids", () => {
    const result = inferCareerDirections({
      projects: [project],
      evidenceItems: [
        evidence("action", "action", "重新组织访谈视频的开头和信息顺序。"),
        evidence(
          "result",
          "result",
          "同批测试用户的前 30 秒完成观看率由 41% 提升到 56%。",
        ),
        evidence(
          "rejected",
          "action",
          "协调跨团队排期并推进交付。",
          "rejected",
        ),
      ],
      capabilityClaims: [],
    });

    const content = result.find(
      (candidate) => candidate.id === "content-strategy",
    );
    expect(content?.supportingEvidenceIds).toEqual(
      expect.arrayContaining(["action", "result"]),
    );
    expect(content?.supportingEvidenceIds).not.toContain("rejected");
    expect(content?.strength).toBe("emerging");
    expect(
      result.some((candidate) => candidate.id === "project-management"),
    ).toBe(false);
  });

  it("does not turn one isolated signal into a role recommendation", () => {
    const result = inferCareerDirections({
      projects: [],
      evidenceItems: [evidence("only", "action", "整理一次项目会议材料。")],
      capabilityClaims: [],
    });

    expect(result).toEqual([]);
  });

  it("does not infer ability from hypotheses and problems without behavior", () => {
    const result = inferCareerDirections({
      projects: [project],
      evidenceItems: [
        evidence("problem", "problem", "用户反馈内容结构难以理解。"),
        evidence("hypothesis", "hypothesis", "调整开头可能提高观看率。"),
      ],
      capabilityClaims: [],
    });

    expect(result).toEqual([]);
  });

  it("can combine confirmed evidence and a confirmed capability claim", () => {
    const claim: CapabilityClaim = {
      id: "claim-1",
      title: "从用户动机反推内容结构",
      statement: "能从访谈反馈中定位信息顺序问题。",
      context: "人物访谈内容改版",
      scope: "single_project",
      reviewState: "confirmed",
      authoredBy: "user",
      behaviorEvidenceIds: ["action"],
      outcomeEvidenceIds: [],
      feedbackEvidenceIds: [],
      caseStudyIds: ["case-1"],
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
      schemaVersion: 1,
    };
    const result = inferCareerDirections({
      projects: [project],
      evidenceItems: [
        evidence("action", "decision", "根据用户反馈调整视频内容结构。"),
      ],
      capabilityClaims: [claim],
    });

    expect(
      result.find((candidate) => candidate.id === "content-strategy")
        ?.supportingClaimIds,
    ).toContain("claim-1");
  });
});
