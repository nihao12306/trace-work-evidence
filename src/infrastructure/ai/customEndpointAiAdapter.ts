import { z } from "zod";
import type {
  AiAdapter,
  EvidenceProposal,
  EvidenceSourceCandidate,
  OutputBlockProposal,
} from "../../application/ports/aiAdapter";
import type {
  CaseSectionKey,
  EvidenceType,
  EpistemicKind,
  WeeklySectionKey,
} from "../../domain/model";

const evidenceTypeSchema = z.enum([
  "action",
  "problem",
  "decision",
  "result",
  "feedback",
  "learning",
  "hypothesis",
]);
const epistemicKindSchema = z.enum([
  "observed_fact",
  "user_judgment",
  "ai_inference",
  "hypothesis",
]);
const weeklySectionSchema = z.enum([
  "focus",
  "results",
  "went_well",
  "problems",
  "supported_causes",
  "inferred_causes",
  "next_validations",
  "personal_reflection",
]);
const caseSectionSchema = z.enum([
  "background",
  "problem",
  "judgment",
  "action",
  "iteration",
  "result",
  "capability",
]);

const evidenceProposalSchema = z
  .object({
    statement: z.string().trim().min(1),
    type: evidenceTypeSchema,
    epistemicKind: epistemicKindSchema,
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    sourceCitationIds: z.array(z.string().min(1)),
  })
  .strict();

const outputBlockProposalSchema = z
  .object({
    sectionKey: z.union([weeklySectionSchema, caseSectionSchema]),
    content: z.string().trim().min(1),
    epistemicKind: epistemicKindSchema,
    sourceCitationIds: z.array(z.string().min(1)),
  })
  .strict();

const responseSchema = z
  .object({ proposals: z.array(outputBlockProposalSchema) })
  .strict();
const evidenceResponseSchema = z
  .object({ proposals: z.array(evidenceProposalSchema) })
  .strict();

/**
 * 用户自己控制的端点适配器。它不接收或保存 API Key；发送范围由调用方
 * 先在界面展示，响应还会在 WorkbenchService 中重新做引用和栏目校验。
 */
export class CustomEndpointAiAdapter implements AiAdapter {
  readonly kind = "custom_endpoint" as const;

  constructor(
    private readonly endpoint: string,
    private readonly timeoutMs = 15_000,
  ) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("自定义 AI 端点必须使用 http 或 https 地址。 ");
    }
  }

  async extractEvidence(input: {
    recordId: string;
    revisionId: string;
    originalText: string;
    occurredOn: string;
    sourceCandidates: EvidenceSourceCandidate[];
  }): Promise<EvidenceProposal[]> {
    const payload = await this.request("extract_evidence", input);
    const parsed = evidenceResponseSchema.safeParse(payload);
    if (!parsed.success) throw invalidResponse();
    return parsed.data.proposals;
  }

  async draftWeeklyReview(input: {
    weeklyReviewId: string;
    evidence: Array<{
      id: string;
      statement: string;
      type: EvidenceType;
      epistemicKind: EpistemicKind;
      occurredOn: string;
      citationIds: string[];
    }>;
  }): Promise<OutputBlockProposal[]> {
    const payload = await this.request("draft_weekly_review", input);
    return parseOutputProposals(payload);
  }

  async draftCaseStudy(input: {
    caseStudyId: string;
    evidence: Array<{
      id: string;
      statement: string;
      type: EvidenceType;
      epistemicKind: EpistemicKind;
      occurredOn: string;
      citationIds: string[];
    }>;
  }): Promise<OutputBlockProposal[]> {
    const payload = await this.request("draft_case_study", input);
    return parseOutputProposals(payload);
  }

  async rewriteBlock(input: {
    blockId: string;
    content: string;
    instruction: string;
    citationIds: string[];
    epistemicKind: EpistemicKind;
  }): Promise<OutputBlockProposal> {
    const payload = await this.request("rewrite_block", input);
    const parsed = responseSchema.safeParse(payload);
    if (!parsed.success || parsed.data.proposals.length !== 1) {
      throw invalidResponse();
    }
    return parsed.data.proposals[0]!;
  }

  private async request(task: AiTask, input: unknown): Promise<unknown> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        credentials: "omit",
        body: JSON.stringify({
          protocol: "trace-custom-ai",
          protocolVersion: 1,
          task,
          input,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`自定义 AI 端点返回了 HTTP ${response.status}。`);
      }
      return await response.json();
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("自定义 AI")) {
        throw error;
      }
      throw new Error(
        "自定义 AI 请求失败；没有写入任何候选，请检查端点和网络。",
        { cause: error },
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

type AiTask =
  | "extract_evidence"
  | "draft_weekly_review"
  | "draft_case_study"
  | "rewrite_block";

function parseOutputProposals(value: unknown): OutputBlockProposal[] {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success) throw invalidResponse();
  return parsed.data.proposals.map((proposal) => ({
    ...proposal,
    sectionKey: proposal.sectionKey as WeeklySectionKey | CaseSectionKey,
  }));
}

function invalidResponse(): Error {
  return new Error(
    "自定义 AI 响应格式无效；没有写入任何候选，请返回 Trace 约定的 proposals 数组。",
  );
}
