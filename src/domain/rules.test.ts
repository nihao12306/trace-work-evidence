import { describe, expect, it } from "vitest";
import type {
  CapabilityClaim,
  CaseStudy,
  Citation,
  EvidenceItem,
  OutputBlock,
  RecordRevision,
  WeeklyReview,
  WeeklyReviewRevision,
} from "./model";
import {
  assessCitationValidity,
  assertCapabilityClaimConfirmable,
  assertCapabilityWordingMatchesScope,
  assertEvidenceShape,
  assertOutputBlockFinalizable,
  confirmEvidence,
  createFinalizedWeeklyRevision,
  eligibleEvidenceForGeneration,
  exportableBlocks,
  traceCitationToRecordRevision,
} from "./rules";
import { getWeekRange } from "./week";

const NOW = "2026-08-03T02:00:00.000Z";

function meta(id: string) {
  return { id, createdAt: NOW, updatedAt: NOW, schemaVersion: 1 } as const;
}

function evidence(overrides: Partial<EvidenceItem> = {}): EvidenceItem {
  return {
    ...meta("evidence-1"),
    occurredOn: "2026-08-03",
    type: "action",
    statement: "整理了访谈时间线。",
    epistemicKind: "user_judgment",
    reviewState: "draft",
    authoredBy: "user",
    confirmedByUser: false,
    citationIds: [],
    ...overrides,
  };
}

function citation(overrides: Partial<Citation> = {}): Citation {
  return {
    ...meta("citation-1"),
    targetKind: "source_record_revision",
    targetId: "revision-1",
    recordId: "record-1",
    quoteSnapshot: "原始摘录",
    validity: "valid",
    ...overrides,
  };
}

function outputBlock(overrides: Partial<OutputBlock> = {}): OutputBlock {
  return {
    ...meta("block-1"),
    ownerKind: "weekly_review_revision",
    ownerId: "weekly-revision-1",
    sectionKey: "focus",
    order: 0,
    content: "完成访谈结构调整。",
    epistemicKind: "user_judgment",
    reviewState: "confirmed",
    authoredBy: "user",
    citationIds: [],
    ...overrides,
  };
}

describe("evidence rules", () => {
  it("prevents AI-authored evidence from starting confirmed", () => {
    expect(() =>
      assertEvidenceShape(
        evidence({
          authoredBy: "ai",
          epistemicKind: "ai_inference",
          reviewState: "confirmed",
          confirmedByUser: true,
        }),
      ),
    ).toThrowError(/待确认候选/);
  });

  it("keeps an AI inference epistemically an inference after user confirmation", () => {
    const proposed = evidence({
      authoredBy: "ai",
      epistemicKind: "ai_inference",
      reviewState: "proposed",
    });

    const confirmed = confirmEvidence(proposed, [], NOW);

    expect(confirmed.reviewState).toBe("confirmed");
    expect(confirmed.epistemicKind).toBe("ai_inference");
    expect(confirmed.confirmedByUser).toBe(true);
  });

  it("requires a valid citation before confirming an observed fact", () => {
    const fact = evidence({
      epistemicKind: "observed_fact",
      citationIds: ["citation-1"],
    });

    expect(() =>
      confirmEvidence(fact, [citation({ validity: "stale" })], NOW),
    ).toThrowError(/有效来源/);
    expect(confirmEvidence(fact, [citation()], NOW).reviewState).toBe(
      "confirmed",
    );
  });

  it("keeps evidence type and epistemic kind aligned for hypotheses", () => {
    expect(() =>
      assertEvidenceShape(
        evidence({ type: "hypothesis", epistemicKind: "user_judgment" }),
      ),
    ).toThrowError(/假设/);
    expect(() =>
      assertEvidenceShape(
        evidence({ type: "action", epistemicKind: "hypothesis" }),
      ),
    ).toThrowError(/假设/);
  });

  it("only allows result stage on result evidence", () => {
    expect(() =>
      assertEvidenceShape(evidence({ resultStage: "final" })),
    ).toThrowError(/只有结果证据/);
    expect(() =>
      assertEvidenceShape(evidence({ type: "result", resultStage: "final" })),
    ).not.toThrow();
  });

  it("excludes rejected evidence and blocks from generation and exports", () => {
    const rejectedEvidence = evidence({
      id: "rejected",
      reviewState: "rejected",
    });
    const confirmedEvidence = evidence({
      id: "confirmed",
      reviewState: "confirmed",
    });
    const rejectedBlock = outputBlock({
      id: "rejected",
      reviewState: "rejected",
    });
    const confirmedBlock = outputBlock({
      id: "confirmed",
      reviewState: "confirmed",
    });

    expect(
      eligibleEvidenceForGeneration([rejectedEvidence, confirmedEvidence]),
    ).toEqual([confirmedEvidence]);
    expect(exportableBlocks([rejectedBlock, confirmedBlock])).toEqual([
      confirmedBlock,
    ]);
  });
});

describe("citation rules", () => {
  it("prevents a factual output block without a valid citation from finalizing", () => {
    const block = outputBlock({
      epistemicKind: "observed_fact",
      citationIds: ["citation-1"],
    });

    expect(() => assertOutputBlockFinalizable(block, [])).toThrowError(
      /有效来源/,
    );
    expect(() =>
      assertOutputBlockFinalizable(block, [citation()]),
    ).not.toThrow();
  });

  it("requires a next validation to point to a confirmed hypothesis", () => {
    const hypothesis = evidence({
      id: "hypothesis",
      type: "hypothesis",
      epistemicKind: "hypothesis",
      reviewState: "confirmed",
      citationIds: ["citation-1"],
    });
    const validation = outputBlock({
      sectionKey: "next_validations",
      epistemicKind: "hypothesis",
      reviewState: "confirmed",
      citationIds: ["citation-1"],
    });

    expect(() =>
      assertOutputBlockFinalizable(validation, [citation()], [hypothesis]),
    ).not.toThrow();
    expect(() =>
      assertOutputBlockFinalizable(
        { ...validation, citationIds: [] },
        [citation()],
        [hypothesis],
      ),
    ).toThrowError(/关联一条已确认的假设/);
  });

  it("traces a secondary evidence citation to the exact source revision", () => {
    const revision: RecordRevision = {
      ...meta("revision-1"),
      recordId: "record-1",
      revisionNumber: 1,
      text: "原始摘录",
      author: "user",
    };
    const sourceCitation = citation();
    const supportingEvidence = evidence({
      id: "evidence-source",
      citationIds: [sourceCitation.id],
    });
    const evidenceCitation = citation({
      id: "citation-evidence",
      targetKind: "evidence_item",
      targetId: supportingEvidence.id,
    });

    expect(
      traceCitationToRecordRevision(
        evidenceCitation.id,
        [sourceCitation, evidenceCitation],
        [supportingEvidence],
        [revision],
      ),
    ).toEqual([revision]);
  });

  it("marks a quote stale after revision without changing its snapshot", () => {
    const original = citation({ quoteSnapshot: "当时的原话" });
    const assessed = assessCitationValidity(
      original,
      "修改后的内容不再包含旧摘录",
    );

    expect(assessed.validity).toBe("stale");
    expect(assessed.quoteSnapshot).toBe("当时的原话");
    expect(original.validity).toBe("valid");
  });
});

describe("weekly review rules", () => {
  it("calculates week boundaries with the configured week start", () => {
    expect(getWeekRange("2026-08-03", 1)).toEqual({
      start: "2026-08-03",
      end: "2026-08-09",
    });
    expect(getWeekRange("2026-08-03", 0)).toEqual({
      start: "2026-08-02",
      end: "2026-08-08",
    });
  });

  it("creates a new final revision without mutating the prior final", () => {
    const review: WeeklyReview = {
      ...meta("weekly-1"),
      weekStart: "2026-07-27",
      weekEnd: "2026-08-02",
      timezone: "Asia/Shanghai",
      status: "finalized",
      currentRevisionId: "weekly-revision-1",
      finalizedAt: "2026-08-02T10:00:00.000Z",
    };
    const prior: WeeklyReviewRevision = {
      ...meta("weekly-revision-1"),
      weeklyReviewId: review.id,
      revisionNumber: 1,
      statusSnapshot: "finalized",
      blockIds: ["old-block"],
      createdBy: "user",
    };
    const originalSnapshot = structuredClone(prior);

    const result = createFinalizedWeeklyRevision({
      review,
      priorRevisions: [prior],
      blocks: [outputBlock()],
      citations: [],
      revisionId: "weekly-revision-2",
      finalizedAt: NOW,
    });

    expect(result.revision.revisionNumber).toBe(2);
    expect(result.review.currentRevisionId).toBe("weekly-revision-2");
    expect(prior).toEqual(originalSnapshot);
  });
});

describe("capability claim rules", () => {
  const action = evidence({
    id: "action",
    type: "action",
    reviewState: "confirmed",
  });
  const result = evidence({
    id: "result",
    type: "result",
    reviewState: "confirmed",
  });
  const caseStudy: CaseStudy = {
    ...meta("case-1"),
    projectId: "project-1",
    title: "案例",
    rangeStart: "2026-07-01",
    rangeEnd: "2026-07-31",
    includedEvidenceIds: [action.id, result.id],
    excludedEvidenceIds: [],
    status: "finalized",
    currentRevisionId: "case-revision-1",
  };
  const claim: CapabilityClaim = {
    ...meta("claim-1"),
    title: "从用户动机定位内容问题",
    statement: "在该项目中，能够从用户动机定位信息顺序问题。",
    scope: "single_project",
    reviewState: "confirmed",
    authoredBy: "user",
    context: "素材完整但观看动机不清楚。",
    behaviorEvidenceIds: [action.id],
    outcomeEvidenceIds: [result.id],
    feedbackEvidenceIds: [],
    caseStudyIds: [caseStudy.id],
  };

  it("requires context, behavior, outcome or feedback, and a case", () => {
    expect(() =>
      assertCapabilityClaimConfirmable(claim, [action, result], [caseStudy]),
    ).not.toThrow();
    expect(() =>
      assertCapabilityClaimConfirmable(
        { ...claim, outcomeEvidenceIds: [], feedbackEvidenceIds: [] },
        [action, result],
        [caseStudy],
      ),
    ).toThrowError(/情境、行为、结果或反馈/);
  });

  it("prevents a single-project claim from overstating long-term scope", () => {
    expect(() => assertCapabilityWordingMatchesScope(claim)).not.toThrow();
    expect(() =>
      assertCapabilityWordingMatchesScope({
        ...claim,
        statement: "长期稳定地从用户动机定位所有内容问题。",
      }),
    ).toThrowError(/单项目/);
  });
});
