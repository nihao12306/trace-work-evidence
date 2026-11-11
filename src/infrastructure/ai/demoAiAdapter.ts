import type {
  AiAdapter,
  EvidenceProposal,
  EvidenceSourceCandidate,
  OutputBlockProposal,
} from "../../application/ports/aiAdapter";
import type {
  EvidenceType,
  WeeklySectionKey,
  CaseSectionKey,
} from "../../domain/model";

/**
 * 一个可公开运行的、无网络的演示适配器。
 *
 * 它不会生成新的事实，也不会补写结果；只把应用已经从用户原文中
 * 找到的候选，转成带有相同引用的 AI 候选。这样演示模式可以复现，
 * 同时不会把“模型猜测”伪装成用户经历。
 */
export class DemoAiAdapter implements AiAdapter {
  readonly kind = "demo" as const;

  async extractEvidence(input: {
    recordId: string;
    revisionId: string;
    originalText: string;
    occurredOn: string;
    sourceCandidates: EvidenceSourceCandidate[];
  }): Promise<EvidenceProposal[]> {
    void input.recordId;
    void input.revisionId;
    void input.originalText;
    return input.sourceCandidates.map((candidate) => ({
      statement: candidate.statement,
      type: candidate.type,
      epistemicKind: candidate.epistemicKind,
      occurredOn: candidate.occurredOn,
      sourceCitationIds: [candidate.citationId],
    }));
  }

  async draftWeeklyReview(input: {
    weeklyReviewId: string;
    evidence: Array<{
      id: string;
      statement: string;
      type: EvidenceType;
      epistemicKind: EvidenceSourceCandidate["epistemicKind"];
      occurredOn: string;
      citationIds: string[];
    }>;
  }): Promise<OutputBlockProposal[]> {
    void input.weeklyReviewId;
    const blocks = input.evidence.flatMap((evidence) => {
      const sectionKey = weeklySectionForEvidence(evidence.type);
      if (!sectionKey) return [];
      return [
        {
          sectionKey,
          content: evidence.statement,
          epistemicKind: evidence.epistemicKind,
          sourceCitationIds: evidence.citationIds,
        },
      ];
    });
    const firstEvidence = input.evidence[0];
    if (firstEvidence) {
      blocks.push({
        sectionKey: "personal_reflection",
        content: "请由你补写：本周哪个判断值得在下一周继续验证？",
        epistemicKind: "user_judgment",
        sourceCitationIds: firstEvidence.citationIds,
      });
    }
    return blocks;
  }

  async draftCaseStudy(input: {
    caseStudyId: string;
    evidence: Array<{
      id: string;
      statement: string;
      type: EvidenceType;
      epistemicKind: EvidenceSourceCandidate["epistemicKind"];
      occurredOn: string;
      citationIds: string[];
    }>;
  }): Promise<OutputBlockProposal[]> {
    void input.caseStudyId;
    return input.evidence.flatMap((evidence) => {
      const sectionKey = caseSectionForEvidence(evidence.type);
      if (!sectionKey) return [];
      return [
        {
          sectionKey,
          content: evidence.statement,
          epistemicKind: evidence.epistemicKind,
          sourceCitationIds: evidence.citationIds,
        },
      ];
    });
  }

  async rewriteBlock(input: {
    blockId: string;
    content: string;
    instruction: string;
    citationIds: string[];
    epistemicKind: EvidenceSourceCandidate["epistemicKind"];
  }): Promise<OutputBlockProposal> {
    void input.blockId;
    void input.instruction;
    return {
      sectionKey: "personal_reflection",
      content: input.content,
      epistemicKind: input.epistemicKind,
      sourceCitationIds: input.citationIds,
    };
  }
}

function weeklySectionForEvidence(
  type: EvidenceType,
): WeeklySectionKey | undefined {
  switch (type) {
    case "action":
    case "decision":
      return "focus";
    case "result":
      return "results";
    case "feedback":
    case "learning":
      return "went_well";
    case "problem":
      return "problems";
    case "hypothesis":
      return "next_validations";
  }
}

function caseSectionForEvidence(
  type: EvidenceType,
): CaseSectionKey | undefined {
  switch (type) {
    case "problem":
      return "problem";
    case "decision":
      return "judgment";
    case "action":
      return "action";
    case "feedback":
      return "iteration";
    case "result":
      return "result";
    case "learning":
      return "capability";
    case "hypothesis":
      return "judgment";
  }
}
