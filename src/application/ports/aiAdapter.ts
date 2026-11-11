import type {
  EpistemicKind,
  EvidenceType,
  ISODate,
  OutputBlock,
} from "../../domain/model";

export interface EvidenceSourceCandidate {
  citationId: string;
  quoteSnapshot: string;
  charRange?: { start: number; end: number };
  statement: string;
  type: EvidenceType;
  epistemicKind: EpistemicKind;
  occurredOn: ISODate;
}

export interface EvidenceProposal {
  statement: string;
  type: EvidenceType;
  epistemicKind: EpistemicKind;
  occurredOn: ISODate;
  sourceCitationIds: string[];
}

export interface OutputBlockProposal {
  sectionKey: OutputBlock["sectionKey"];
  content: string;
  epistemicKind: EpistemicKind;
  sourceCitationIds: string[];
}

export interface AiAdapter {
  readonly kind: "demo" | "custom_endpoint";
  extractEvidence(input: {
    recordId: string;
    revisionId: string;
    originalText: string;
    occurredOn: ISODate;
    sourceCandidates: EvidenceSourceCandidate[];
  }): Promise<EvidenceProposal[]>;
  draftWeeklyReview(input: {
    weeklyReviewId: string;
    evidence: Array<{
      id: string;
      statement: string;
      type: EvidenceType;
      epistemicKind: EpistemicKind;
      occurredOn: ISODate;
      citationIds: string[];
    }>;
  }): Promise<OutputBlockProposal[]>;
  draftCaseStudy(input: {
    caseStudyId: string;
    evidence: Array<{
      id: string;
      statement: string;
      type: EvidenceType;
      epistemicKind: EpistemicKind;
      occurredOn: ISODate;
      citationIds: string[];
    }>;
  }): Promise<OutputBlockProposal[]>;
  rewriteBlock(input: {
    blockId: string;
    content: string;
    instruction: string;
    citationIds: string[];
    epistemicKind: EpistemicKind;
  }): Promise<OutputBlockProposal>;
}

// 适配器只返回未持久化的结构化候选。候选状态、引用校验与数据库写入由应用用例负责。
