import { DomainError } from "./errors";
import type {
  CapabilityClaim,
  CaseStudy,
  CaseStudyRevision,
  Citation,
  EvidenceItem,
  ISODateTime,
  OutputBlock,
  RecordRevision,
  WeeklyReview,
  WeeklyReviewRevision,
} from "./model";

const caseSectionKeys = [
  "background",
  "problem",
  "judgment",
  "action",
  "iteration",
  "result",
  "capability",
] as const;

export function assertAiEvidenceStartsAsProposal(evidence: EvidenceItem): void {
  if (
    evidence.authoredBy === "ai" &&
    (evidence.reviewState !== "proposed" || evidence.confirmedByUser)
  ) {
    throw new DomainError(
      "AI_CONTENT_MUST_BE_PROPOSED",
      "AI 整理结果必须先作为待确认候选。",
    );
  }
}

export function assertEvidenceShape(evidence: EvidenceItem): void {
  const isHypothesisType = evidence.type === "hypothesis";
  const isHypothesisKind = evidence.epistemicKind === "hypothesis";

  if (isHypothesisType !== isHypothesisKind) {
    throw new DomainError(
      "HYPOTHESIS_KIND_MISMATCH",
      "假设的证据类型与认识论身份必须保持一致。",
    );
  }

  if (evidence.type !== "result" && evidence.resultStage !== undefined) {
    throw new DomainError(
      "INVALID_RESULT_STAGE",
      "只有结果证据可以标记阶段性或最终结果。",
    );
  }

  assertAiEvidenceStartsAsProposal(evidence);
}

export function confirmEvidence(
  evidence: EvidenceItem,
  citations: readonly Citation[],
  confirmedAt: ISODateTime,
): EvidenceItem {
  assertEvidenceShape(evidence);

  if (
    evidence.epistemicKind === "observed_fact" &&
    !hasValidCitation(evidence.citationIds, citations)
  ) {
    throw new DomainError(
      "FACT_REQUIRES_CITATION",
      "事实性证据需要至少一条有效来源。",
    );
  }

  return {
    ...evidence,
    reviewState: "confirmed",
    confirmedAt,
    confirmedByUser: true,
    updatedAt: confirmedAt,
  };
}

export function assertOutputBlockFinalizable(
  block: OutputBlock,
  citations: readonly Citation[],
  evidenceItems: readonly EvidenceItem[] = [],
): void {
  if (block.reviewState !== "confirmed") {
    throw new DomainError("OUTPUT_NOT_REVIEWED", "仍有内容尚未由用户确认。 ");
  }

  if (
    block.epistemicKind === "observed_fact" &&
    !hasValidCitation(block.citationIds, citations)
  ) {
    throw new DomainError(
      "FACT_REQUIRES_CITATION",
      "事实性输出必须保留有效来源。",
    );
  }

  assertValidationBlockLinkedToHypothesis(block, citations, evidenceItems);
}

/**
 * A next-week validation is useful only when it points back to a confirmed
 * hypothesis or inference. The link is represented by a shared source
 * citation so the original excerpt remains the source of truth.
 */
export function assertValidationBlockLinkedToHypothesis(
  block: OutputBlock,
  citations: readonly Citation[],
  evidenceItems: readonly EvidenceItem[],
): void {
  if (block.sectionKey !== "next_validations") return;

  const validCitationIds = new Set(
    citations
      .filter(
        (citation) =>
          citation.validity === "valid" &&
          block.citationIds.includes(citation.id),
      )
      .map((citation) => citation.id),
  );
  const linked = evidenceItems.some(
    (evidence) =>
      evidence.reviewState === "confirmed" &&
      (evidence.type === "hypothesis" ||
        evidence.epistemicKind === "ai_inference" ||
        evidence.epistemicKind === "hypothesis") &&
      evidence.citationIds.some((citationId) =>
        validCitationIds.has(citationId),
      ),
  );

  if (!linked) {
    throw new DomainError(
      "VALIDATION_REQUIRES_HYPOTHESIS",
      "下周验证项必须关联一条已确认的假设或推测证据。",
    );
  }
}

export function hasValidCitation(
  citationIds: readonly string[],
  citations: readonly Citation[],
): boolean {
  const requested = new Set(citationIds);
  return citations.some(
    (citation) => requested.has(citation.id) && citation.validity === "valid",
  );
}

export function assessCitationValidity(
  citation: Citation,
  currentTargetText: string | undefined,
): Citation {
  if (currentTargetText === undefined) {
    return { ...citation, validity: "missing" };
  }

  return {
    ...citation,
    validity: currentTargetText.includes(citation.quoteSnapshot)
      ? "valid"
      : "stale",
  };
}

export function traceCitationToRecordRevision(
  citationId: string,
  citations: readonly Citation[],
  evidenceItems: readonly EvidenceItem[],
  recordRevisions: readonly RecordRevision[],
): RecordRevision[] {
  const citationById = new Map(
    citations.map((citation) => [citation.id, citation]),
  );
  const evidenceById = new Map(
    evidenceItems.map((evidence) => [evidence.id, evidence]),
  );
  const revisionById = new Map(
    recordRevisions.map((revision) => [revision.id, revision]),
  );
  const revisions = new Map<string, RecordRevision>();
  const visitedCitations = new Set<string>();
  const visitedEvidence = new Set<string>();

  const visitCitation = (id: string): void => {
    if (visitedCitations.has(id)) {
      throw new DomainError("CITATION_CHAIN_BROKEN", "引用链包含循环。 ");
    }
    visitedCitations.add(id);

    const citation = citationById.get(id);
    if (!citation) {
      throw new DomainError("CITATION_CHAIN_BROKEN", "引用目标不存在。 ");
    }

    if (citation.targetKind === "source_record_revision") {
      const revision = revisionById.get(citation.targetId);
      if (!revision) {
        throw new DomainError("CITATION_CHAIN_BROKEN", "原始记录修订不存在。 ");
      }
      revisions.set(revision.id, revision);
      visitedCitations.delete(id);
      return;
    }

    if (visitedEvidence.has(citation.targetId)) {
      throw new DomainError("CITATION_CHAIN_BROKEN", "证据引用链包含循环。 ");
    }

    const evidence = evidenceById.get(citation.targetId);
    if (!evidence) {
      throw new DomainError("CITATION_CHAIN_BROKEN", "被引用证据不存在。 ");
    }

    visitedEvidence.add(evidence.id);
    evidence.citationIds.forEach(visitCitation);
    visitedEvidence.delete(evidence.id);
    visitedCitations.delete(id);
  };

  visitCitation(citationId);
  return [...revisions.values()];
}

export function eligibleEvidenceForGeneration(
  evidenceItems: readonly EvidenceItem[],
): EvidenceItem[] {
  return evidenceItems.filter(
    (evidence) => evidence.reviewState !== "rejected",
  );
}

export function exportableBlocks(
  blocks: readonly OutputBlock[],
): OutputBlock[] {
  return blocks.filter((block) => block.reviewState === "confirmed");
}

export function createFinalizedWeeklyRevision(input: {
  review: WeeklyReview;
  priorRevisions: readonly WeeklyReviewRevision[];
  blocks: readonly OutputBlock[];
  citations: readonly Citation[];
  evidenceItems?: readonly EvidenceItem[];
  revisionId: string;
  finalizedAt: ISODateTime;
}): { review: WeeklyReview; revision: WeeklyReviewRevision } {
  input.blocks.forEach((block) =>
    assertOutputBlockFinalizable(block, input.citations, input.evidenceItems),
  );

  const nextRevisionNumber =
    Math.max(
      0,
      ...input.priorRevisions
        .filter((revision) => revision.weeklyReviewId === input.review.id)
        .map((revision) => revision.revisionNumber),
    ) + 1;

  const revision: WeeklyReviewRevision = {
    id: input.revisionId,
    weeklyReviewId: input.review.id,
    revisionNumber: nextRevisionNumber,
    statusSnapshot: "finalized",
    blockIds: input.blocks.map((block) => block.id),
    createdBy: "user",
    createdAt: input.finalizedAt,
    updatedAt: input.finalizedAt,
    schemaVersion: input.review.schemaVersion,
  };

  return {
    revision,
    review: {
      ...input.review,
      status: "finalized",
      currentRevisionId: revision.id,
      finalizedAt: input.finalizedAt,
      updatedAt: input.finalizedAt,
    },
  };
}

export function assertCaseStudyFinalizable(
  blocks: readonly OutputBlock[],
  citations: readonly Citation[],
  evidenceItems?: readonly EvidenceItem[],
): void {
  for (const sectionKey of caseSectionKeys) {
    const block = blocks.find((item) => item.sectionKey === sectionKey);
    if (!block || !block.content.trim()) {
      throw new DomainError(
        "CASE_SECTION_INCOMPLETE",
        "项目案例的七个部分都需要先写下内容。",
      );
    }
  }
  blocks.forEach((block) => assertCaseStudyBlockFinalizable(block, citations));
  const capabilityBlock = blocks.find(
    (block) => block.sectionKey === "capability",
  );
  if (capabilityBlock && evidenceItems) {
    const behaviorEvidence = evidenceItems.filter(
      (evidence) =>
        (evidence.type === "action" || evidence.type === "decision") &&
        evidence.reviewState === "confirmed" &&
        evidence.citationIds.some((citationId) =>
          capabilityBlock.citationIds.includes(citationId),
        ),
    );
    if (behaviorEvidence.length === 0) {
      throw new DomainError(
        "CAPABILITY_EVIDENCE_INCOMPLETE",
        "形成的能力至少需要引用一条已确认的行动或决策证据。",
      );
    }
  }
}

export function assertCaseStudyBlockFinalizable(
  block: OutputBlock,
  citations: readonly Citation[],
): void {
  assertOutputBlockFinalizable(block, citations);
  if (
    block.sectionKey === "capability" &&
    !hasValidCitation(block.citationIds, citations)
  ) {
    throw new DomainError(
      "CAPABILITY_EVIDENCE_INCOMPLETE",
      "形成的能力必须至少引用一条行为或判断证据。",
    );
  }
}

export function createFinalizedCaseStudyRevision(input: {
  caseStudy: CaseStudy;
  priorRevisions: readonly CaseStudyRevision[];
  blocks: readonly OutputBlock[];
  citations: readonly Citation[];
  evidenceItems?: readonly EvidenceItem[];
  revisionId: string;
  finalizedAt: ISODateTime;
}): { caseStudy: CaseStudy; revision: CaseStudyRevision } {
  assertCaseStudyFinalizable(
    input.blocks,
    input.citations,
    input.evidenceItems,
  );
  const revision: CaseStudyRevision = {
    id: input.revisionId,
    caseStudyId: input.caseStudy.id,
    revisionNumber:
      Math.max(
        0,
        ...input.priorRevisions
          .filter((item) => item.caseStudyId === input.caseStudy.id)
          .map((item) => item.revisionNumber),
      ) + 1,
    blockIds: input.blocks.map((block) => block.id),
    createdBy: "user",
    createdAt: input.finalizedAt,
    updatedAt: input.finalizedAt,
    schemaVersion: input.caseStudy.schemaVersion,
  };
  return {
    revision,
    caseStudy: {
      ...input.caseStudy,
      status: "finalized",
      currentRevisionId: revision.id,
      finalizedAt: input.finalizedAt,
      updatedAt: input.finalizedAt,
    },
  };
}

export function assertCapabilityClaimConfirmable(
  claim: CapabilityClaim,
  evidenceItems: readonly EvidenceItem[],
  caseStudies: readonly CaseStudy[],
): void {
  const evidenceById = new Map(
    evidenceItems.map((evidence) => [evidence.id, evidence]),
  );
  const cases = caseStudies.filter((item) =>
    claim.caseStudyIds.includes(item.id),
  );
  const behaviors = claim.behaviorEvidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is EvidenceItem => item !== undefined)
    .filter(
      (item) =>
        item.reviewState === "confirmed" &&
        (item.type === "action" || item.type === "decision"),
    );
  const outcomes = claim.outcomeEvidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is EvidenceItem => item !== undefined)
    .filter(
      (item) => item.reviewState === "confirmed" && item.type === "result",
    );
  const feedback = claim.feedbackEvidenceIds
    .map((id) => evidenceById.get(id))
    .filter((item): item is EvidenceItem => item !== undefined)
    .filter(
      (item) => item.reviewState === "confirmed" && item.type === "feedback",
    );

  const baseChainComplete =
    claim.context.trim().length > 0 &&
    behaviors.length > 0 &&
    outcomes.length + feedback.length > 0 &&
    cases.length > 0 &&
    cases.every((item) => item.status === "finalized");

  const projectIds = new Set(cases.map((item) => item.projectId));
  const crossProjectComplete =
    claim.scope !== "cross_project" ||
    (projectIds.size >= 2 &&
      cases.every((item) => item.status === "finalized"));

  if (!baseChainComplete || !crossProjectComplete) {
    throw new DomainError(
      "CAPABILITY_EVIDENCE_INCOMPLETE",
      "能力主张需要情境、行为、结果或反馈，以及相应项目案例。",
    );
  }
}

const crossProjectPhrases = [
  "长期稳定",
  "持续擅长",
  "一贯能够",
  "始终能够",
  "反复证明",
];

export function assertCapabilityWordingMatchesScope(
  claim: CapabilityClaim,
): void {
  if (
    claim.scope === "single_project" &&
    crossProjectPhrases.some((phrase) => claim.statement.includes(phrase))
  ) {
    throw new DomainError(
      "CAPABILITY_SCOPE_OVERSTATED",
      "单项目能力主张不能写成跨项目的长期稳定能力。",
    );
  }
}
