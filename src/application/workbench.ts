import type { WorkbenchRepository } from "./ports/workbenchRepository";
import type {
  AiAdapter,
  EvidenceProposal,
  EvidenceSourceCandidate,
  OutputBlockProposal,
} from "./ports/aiAdapter";
import { confirmEvidence as applyEvidenceConfirmation } from "../domain/rules";
import { assertEvidenceShape } from "../domain/rules";
import { createFinalizedWeeklyRevision } from "../domain/rules";
import { createFinalizedCaseStudyRevision } from "../domain/rules";
import { extractTextEvidenceProposals } from "../domain/textEvidence";
import {
  assertCapabilityClaimConfirmable,
  assertCapabilityWordingMatchesScope,
} from "../domain/rules";
import type {
  CaseStudy,
  CaseStudyRevision,
  CapabilityClaim,
  Citation,
  EpistemicKind,
  EvidenceItem,
  EvidenceType,
  ISODate,
  OutputBlock,
  Project,
  RecordRevision,
  SourceRecord,
  StructuredRecordFields,
  WeeklyReview,
  WeeklyReviewRevision,
  WeeklySectionKey,
  WorkspaceSettings,
} from "../domain/model";
import {
  assertCaseStudyBlockFinalizable,
  assertAiEvidenceStartsAsProposal,
  assertOutputBlockFinalizable,
  assertValidationBlockLinkedToHypothesis,
} from "../domain/rules";

export interface RuntimeServices {
  createId(): string;
  now(): string;
}

export interface CreateRecordInput {
  occurredOn: ISODate;
  originalText: string;
  projectId?: string;
  structuredInput?: StructuredRecordFields;
}

export interface CreateEvidenceInput {
  recordId: string;
  statement: string;
  type: EvidenceType;
  epistemicKind: EpistemicKind;
  resultStage?: "interim" | "final";
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface CreateCaseStudyInput {
  projectId: string;
  title: string;
  rangeStart: ISODate;
  rangeEnd: ISODate;
  includedEvidenceIds: string[];
}

export interface CreateCapabilityClaimInput {
  caseStudyId: string;
  title: string;
  statement: string;
  context: string;
  behaviorEvidenceIds: string[];
  outcomeEvidenceIds: string[];
  feedbackEvidenceIds: string[];
  limitations?: string;
}

export interface CreateWeeklyBlockInput {
  reviewId: string;
  sectionKey: WeeklySectionKey;
  content: string;
  epistemicKind: EpistemicKind;
  citationIds?: string[];
}

export class WorkbenchService {
  constructor(
    private readonly repository: WorkbenchRepository,
    private readonly runtime: RuntimeServices,
    private readonly aiAdapter?: AiAdapter,
    private readonly customAiAdapterFactory?: (
      settings: WorkspaceSettings,
    ) => AiAdapter | undefined,
  ) {}

  private assertAiAvailable(settings?: WorkspaceSettings): AiAdapter {
    const adapter =
      settings?.aiMode === "custom_endpoint"
        ? this.customAiAdapterFactory?.(settings)
        : settings?.aiMode === "demo"
          ? this.aiAdapter
          : undefined;
    if (!adapter || settings?.aiMode === "off" || settings === undefined) {
      throw new Error(
        "尚未启用 AI。可以继续手动整理，或在演示数据中开启演示 AI。 ",
      );
    }
    if (settings.aiMode !== adapter.kind) {
      throw new Error("当前 AI 配置与适配器不匹配，请先检查设置。 ");
    }
    return adapter;
  }

  getSnapshot() {
    return this.repository.getSnapshot();
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    const name = input.name.trim();
    if (!name) throw new Error("项目名称不能为空。 ");
    const now = this.runtime.now();
    const project: Project = {
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      name,
      ...(input.description?.trim()
        ? { description: input.description.trim() }
        : {}),
      status: "active",
      colorToken: "clay",
    };
    await this.repository.createProject(project);
    return project;
  }

  async updateProject(
    projectId: string,
    input: CreateProjectInput,
  ): Promise<Project> {
    const snapshot = await this.repository.getSnapshot();
    const project = snapshot.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("没有找到这个项目。 ");
    const name = input.name.trim();
    if (!name) throw new Error("项目名称不能为空。 ");
    const updated: Project = {
      ...project,
      name,
      ...(input.description?.trim()
        ? { description: input.description.trim() }
        : {}),
      updatedAt: this.runtime.now(),
    };
    if (!input.description?.trim()) delete updated.description;
    await this.repository.updateProject(updated);
    return updated;
  }

  async archiveProject(projectId: string): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const project = snapshot.projects.find((item) => item.id === projectId);
    if (!project) throw new Error("没有找到这个项目。 ");
    await this.repository.updateProject({
      ...project,
      status: "archived",
      updatedAt: this.runtime.now(),
    });
  }

  async assignRecordToProject(
    recordId: string,
    projectId: string | undefined,
  ): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const record = snapshot.records.find((item) => item.id === recordId);
    if (!record) throw new Error("没有找到这条记录。 ");
    if (projectId && !snapshot.projects.some((item) => item.id === projectId)) {
      throw new Error("没有找到要归入的项目。 ");
    }
    const updated: SourceRecord = { ...record, updatedAt: this.runtime.now() };
    if (projectId) updated.projectId = projectId;
    else delete updated.projectId;
    await this.repository.updateRecord(updated);
    const sourceCitationIds = new Set(
      snapshot.citations
        .filter((citation) => citation.recordId === recordId)
        .map((citation) => citation.id),
    );
    await Promise.all(
      snapshot.evidenceItems
        .filter((evidence) =>
          evidence.citationIds.some((citationId) =>
            sourceCitationIds.has(citationId),
          ),
        )
        .map((evidence) => {
          const nextEvidence: EvidenceItem = {
            ...evidence,
            updatedAt: this.runtime.now(),
          };
          if (projectId) nextEvidence.projectId = projectId;
          else delete nextEvidence.projectId;
          return this.repository.updateEvidence(nextEvidence);
        }),
    );
  }

  async archiveRecord(recordId: string): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const record = snapshot.records.find((item) => item.id === recordId);
    if (!record) throw new Error("没有找到这条原始记录。 ");
    if (record.lifecycle === "archived") return;
    await this.repository.updateRecord({
      ...record,
      lifecycle: "archived",
      updatedAt: this.runtime.now(),
    });
  }

  async createCaseStudy(input: CreateCaseStudyInput): Promise<CaseStudy> {
    const snapshot = await this.repository.getSnapshot();
    const project = snapshot.projects.find(
      (item) => item.id === input.projectId,
    );
    if (!project || project.status === "archived") {
      throw new Error("项目案例必须归属于一个有效项目。 ");
    }
    if (input.rangeStart > input.rangeEnd) {
      throw new Error("案例开始日期不能晚于结束日期。 ");
    }
    const eligibleEvidence = snapshot.evidenceItems.filter(
      (evidence) =>
        evidence.projectId === input.projectId &&
        evidence.occurredOn >= input.rangeStart &&
        evidence.occurredOn <= input.rangeEnd &&
        evidence.reviewState === "confirmed",
    );
    const eligibleIds = new Set(
      eligibleEvidence.map((evidence) => evidence.id),
    );
    const invalidSelectedIds = input.includedEvidenceIds.filter(
      (id) => !eligibleIds.has(id),
    );
    if (invalidSelectedIds.length > 0) {
      throw new Error("所选证据中有内容不在案例日期范围内，请先调整选择。 ");
    }
    const includedEvidenceIds = input.includedEvidenceIds.filter((id) =>
      eligibleIds.has(id),
    );
    if (includedEvidenceIds.length === 0) {
      throw new Error("请至少选择一条已确认的项目证据。 ");
    }
    const title = input.title.trim();
    if (!title) throw new Error("案例标题不能为空。 ");

    const now = this.runtime.now();
    const caseStudyId = this.runtime.createId();
    const revisionId = this.runtime.createId();
    const sectionKeys = [
      "background",
      "problem",
      "judgment",
      "action",
      "iteration",
      "result",
      "capability",
    ] as const;
    const blocks: OutputBlock[] = sectionKeys.map((sectionKey, index) => ({
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      ownerKind: "case_study_revision",
      ownerId: revisionId,
      sectionKey,
      order: index,
      content: "",
      epistemicKind:
        sectionKey === "result" ? "observed_fact" : "user_judgment",
      reviewState: "draft",
      authoredBy: "user",
      authorshipNote: "user_written",
      citationIds: [],
    }));
    const revision: CaseStudyRevision = {
      id: revisionId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      caseStudyId,
      revisionNumber: 1,
      blockIds: blocks.map((block) => block.id),
      createdBy: "user",
    };
    const caseStudy: CaseStudy = {
      id: caseStudyId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      projectId: input.projectId,
      title,
      rangeStart: input.rangeStart,
      rangeEnd: input.rangeEnd,
      includedEvidenceIds,
      excludedEvidenceIds: eligibleEvidence
        .map((evidence) => evidence.id)
        .filter((id) => !includedEvidenceIds.includes(id)),
      status: "draft",
      currentRevisionId: revisionId,
    };
    await this.repository.createCaseStudyWithRevision(
      caseStudy,
      revision,
      blocks,
    );
    return caseStudy;
  }

  async draftAiCaseStudyCandidates(
    caseStudyId: string,
  ): Promise<OutputBlock[]> {
    const snapshot = await this.repository.getSnapshot();
    const caseStudy = snapshot.caseStudies.find(
      (item) => item.id === caseStudyId,
    );
    const revision = snapshot.caseStudyRevisions.find(
      (item) => item.id === caseStudy?.currentRevisionId,
    );
    if (!caseStudy || !revision) throw new Error("没有找到这个项目案例。 ");
    if (caseStudy.status === "finalized") {
      throw new Error("定稿案例不能直接生成内容，请先开始新修订。 ");
    }
    const aiAdapter = this.assertAiAvailable(snapshot.settings);
    const evidence = caseStudy.includedEvidenceIds
      .map((id) => snapshot.evidenceItems.find((item) => item.id === id))
      .filter(
        (item): item is EvidenceItem =>
          item !== undefined && item.reviewState === "confirmed",
      );
    if (evidence.length === 0) return [];

    const now = this.runtime.now();
    const runId = this.runtime.createId();
    const baseRun = {
      id: runId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      task: "draft_case_study" as const,
      adapter: aiAdapter.kind,
      modelLabel:
        aiAdapter.kind === "demo" ? "Trace 演示适配器（无网络）" : "自定义端点",
      promptVersion:
        aiAdapter.kind === "demo" ? "demo-case-v1" : "trace-custom-v1",
      inputRefs: [
        { kind: "case_study", id: caseStudy.id, revisionId: revision.id },
        ...evidence.map((item) => ({ kind: "evidence", id: item.id })),
      ],
      startedAt: now,
      outputEntityIds: [],
    };
    const knownCitationIds = new Set(
      evidence.flatMap((item) => item.citationIds),
    );
    try {
      const proposals = await aiAdapter.draftCaseStudy({
        caseStudyId: caseStudy.id,
        evidence: evidence.map((item) => ({
          id: item.id,
          statement: item.statement,
          type: item.type,
          epistemicKind: item.epistemicKind,
          occurredOn: item.occurredOn,
          citationIds: item.citationIds,
        })),
      });
      const existingKeys = new Set(
        snapshot.outputBlocks
          .filter((block) => block.ownerId === revision.id)
          .map(
            (block) =>
              `${block.sectionKey}|${block.content}|${[...block.citationIds].sort().join(",")}`,
          ),
      );
      const blocks: OutputBlock[] = [];
      for (const proposal of proposals) {
        validateAiOutputProposal(proposal, knownCitationIds);
        if (
          ![
            "background",
            "problem",
            "judgment",
            "action",
            "iteration",
            "result",
            "capability",
          ].includes(proposal.sectionKey)
        ) {
          throw new Error("AI 响应包含不属于项目案例的栏目，已安全拒绝写入。 ");
        }
        const citationIds = [...new Set(proposal.sourceCitationIds)];
        const key = `${proposal.sectionKey}|${proposal.content.trim()}|${citationIds
          .slice()
          .sort()
          .join(",")}`;
        if (existingKeys.has(key)) continue;
        const block: OutputBlock = {
          id: this.runtime.createId(),
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
          ownerKind: "case_study_revision",
          ownerId: revision.id,
          sectionKey: proposal.sectionKey,
          order: revision.blockIds.length + blocks.length,
          content: proposal.content.trim(),
          epistemicKind: proposal.epistemicKind,
          reviewState: "proposed",
          authoredBy: "ai",
          authorshipNote: "ai_drafted",
          aiRunId: runId,
          citationIds,
        };
        blocks.push(block);
        existingKeys.add(key);
      }
      const nextRevision: CaseStudyRevision = {
        ...revision,
        blockIds: [...revision.blockIds, ...blocks.map((block) => block.id)],
        updatedAt: this.runtime.now(),
      };
      const aiRun = {
        ...baseRun,
        status: "succeeded" as const,
        completedAt: this.runtime.now(),
        updatedAt: this.runtime.now(),
        outputEntityIds: blocks.map((block) => block.id),
      };
      await this.repository.createAiRunWithCaseBlocks(
        aiRun,
        blocks,
        nextRevision,
      );
      return blocks;
    } catch (caught) {
      await this.repository
        .createAiRun({
          ...baseRun,
          status: "failed" as const,
          completedAt: this.runtime.now(),
          updatedAt: this.runtime.now(),
          errorCode: "AI_RESPONSE_INVALID",
        })
        .catch(() => undefined);
      const message = caught instanceof Error ? caught.message : "未知错误";
      throw new Error(`AI 案例草稿未完成：${message}`, { cause: caught });
    }
  }

  async updateCaseStudyEvidenceSelection(
    caseStudyId: string,
    includedEvidenceIds: string[],
  ): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const caseStudy = snapshot.caseStudies.find(
      (item) => item.id === caseStudyId,
    );
    if (!caseStudy) throw new Error("没有找到这个项目案例。 ");
    if (caseStudy.status === "finalized") {
      throw new Error("定稿案例不能直接修改证据范围，请先开始一个新修订。 ");
    }
    const eligibleEvidence = snapshot.evidenceItems.filter(
      (evidence) =>
        evidence.projectId === caseStudy.projectId &&
        evidence.occurredOn >= caseStudy.rangeStart &&
        evidence.occurredOn <= caseStudy.rangeEnd &&
        evidence.reviewState === "confirmed",
    );
    const eligibleIds = new Set(
      eligibleEvidence.map((evidence) => evidence.id),
    );
    const invalidSelectedIds = includedEvidenceIds.filter(
      (id) => !eligibleIds.has(id),
    );
    if (invalidSelectedIds.length > 0) {
      throw new Error("所选证据中有内容不在案例日期范围内，请先调整选择。 ");
    }
    const nextIncluded = [...new Set(includedEvidenceIds)].filter((id) =>
      eligibleIds.has(id),
    );
    if (nextIncluded.length === 0) {
      throw new Error("项目案例至少需要保留一条已确认的项目证据。 ");
    }
    await this.repository.updateCaseStudy({
      ...caseStudy,
      includedEvidenceIds: nextIncluded,
      excludedEvidenceIds: eligibleEvidence
        .map((evidence) => evidence.id)
        .filter((id) => !nextIncluded.includes(id)),
      updatedAt: this.runtime.now(),
    });
  }

  async updateCaseStudyBlock(
    blockId: string,
    content: string,
    epistemicKind: EpistemicKind,
    citationIds: string[] = [],
  ): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const block = snapshot.outputBlocks.find((item) => item.id === blockId);
    const owner = findCaseStudyOwner(block, snapshot);
    if (!block || !owner) throw new Error("没有找到这段项目案例内容。 ");
    if (owner.caseStudy.status === "finalized") {
      throw new Error("定稿案例不能直接修改，请先开始一个新修订。 ");
    }
    const nextContent = content.trim();
    if (!nextContent) throw new Error("案例内容不能为空。 ");
    const knownCitationIds = new Set(
      snapshot.citations.map((citation) => citation.id),
    );
    if (citationIds.some((citationId) => !knownCitationIds.has(citationId))) {
      throw new Error("案例引用中包含不存在的来源。 ");
    }
    const updated: OutputBlock = {
      ...block,
      content: nextContent,
      epistemicKind,
      citationIds: [...new Set(citationIds)],
      authoredBy: "user",
      authorshipNote:
        block.authoredBy === "system" || block.authoredBy === "ai"
          ? "ai_drafted_user_edited"
          : "user_written",
      reviewState: "draft",
      updatedAt: this.runtime.now(),
    };
    await this.repository.updateOutputBlock(updated);
    return updated;
  }

  async confirmCaseStudyBlock(blockId: string): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const block = snapshot.outputBlocks.find((item) => item.id === blockId);
    const owner = findCaseStudyOwner(block, snapshot);
    if (!block || !owner) throw new Error("没有找到这段项目案例内容。 ");
    if (owner.caseStudy.status === "finalized") {
      throw new Error("定稿案例无需再次确认，请先开始一个新修订。 ");
    }
    const confirmed: OutputBlock = {
      ...block,
      reviewState: "confirmed",
      updatedAt: this.runtime.now(),
    };
    assertCaseStudyBlockFinalizable(confirmed, snapshot.citations);
    await this.repository.updateOutputBlock(confirmed);
    return confirmed;
  }

  async rejectCaseStudyBlock(blockId: string): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const block = snapshot.outputBlocks.find((item) => item.id === blockId);
    const owner = findCaseStudyOwner(block, snapshot);
    if (!block || !owner) throw new Error("没有找到这段项目案例内容。 ");
    if (owner.caseStudy.status === "finalized") {
      throw new Error("定稿案例不能拒绝内容，请先开始新修订。 ");
    }
    const rejected: OutputBlock = {
      ...block,
      reviewState: "rejected",
      rejectionReason: "用户暂不采纳这段项目案例候选。",
      updatedAt: this.runtime.now(),
    };
    await this.repository.updateOutputBlock(rejected);
    return rejected;
  }

  async restoreCaseStudyBlock(blockId: string): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const block = snapshot.outputBlocks.find((item) => item.id === blockId);
    const owner = findCaseStudyOwner(block, snapshot);
    if (!block || !owner) throw new Error("没有找到这段项目案例内容。 ");
    if (owner.caseStudy.status === "finalized") {
      throw new Error("定稿案例不能恢复内容，请先开始新修订。 ");
    }
    if (block.reviewState !== "rejected") {
      throw new Error("只有已拒绝的案例内容可以恢复。 ");
    }
    const restored: OutputBlock = {
      ...block,
      reviewState: "proposed",
      updatedAt: this.runtime.now(),
    };
    delete restored.rejectionReason;
    await this.repository.updateOutputBlock(restored);
    return restored;
  }

  async finalizeCaseStudy(caseStudyId: string): Promise<CaseStudy> {
    const snapshot = await this.repository.getSnapshot();
    const caseStudy = snapshot.caseStudies.find(
      (item) => item.id === caseStudyId,
    );
    const revision = snapshot.caseStudyRevisions.find(
      (item) => item.id === caseStudy?.currentRevisionId,
    );
    if (!caseStudy || !revision) throw new Error("没有找到这个项目案例草稿。 ");
    if (caseStudy.status === "finalized") return caseStudy;
    const blocks = revision.blockIds
      .map((id) => snapshot.outputBlocks.find((block) => block.id === id))
      .filter(
        (block): block is OutputBlock =>
          block !== undefined && block.reviewState !== "rejected",
      )
      .sort((left, right) => left.order - right.order);
    const finalized = createFinalizedCaseStudyRevision({
      caseStudy,
      priorRevisions: snapshot.caseStudyRevisions,
      blocks,
      citations: snapshot.citations,
      evidenceItems: snapshot.evidenceItems,
      revisionId: this.runtime.createId(),
      finalizedAt: this.runtime.now(),
    });
    await this.repository.finalizeCaseStudy(
      finalized.caseStudy,
      finalized.revision,
    );
    return finalized.caseStudy;
  }

  async startCaseStudyRevision(caseStudyId: string): Promise<CaseStudy> {
    const snapshot = await this.repository.getSnapshot();
    const caseStudy = snapshot.caseStudies.find(
      (item) => item.id === caseStudyId,
    );
    const currentRevision = snapshot.caseStudyRevisions.find(
      (item) => item.id === caseStudy?.currentRevisionId,
    );
    if (!caseStudy || !currentRevision)
      throw new Error("没有找到这个项目案例。 ");
    if (caseStudy.status !== "finalized") return caseStudy;

    const now = this.runtime.now();
    const revisionId = this.runtime.createId();
    const blocks = currentRevision.blockIds
      .map((id) => snapshot.outputBlocks.find((block) => block.id === id))
      .filter((block): block is OutputBlock => block !== undefined)
      .sort((left, right) => left.order - right.order)
      .map((block) => ({
        ...block,
        id: this.runtime.createId(),
        createdAt: now,
        updatedAt: now,
        ownerId: revisionId,
        reviewState: "draft" as const,
      }));
    const revision: CaseStudyRevision = {
      id: revisionId,
      caseStudyId: caseStudy.id,
      revisionNumber:
        Math.max(
          0,
          ...snapshot.caseStudyRevisions
            .filter((item) => item.caseStudyId === caseStudy.id)
            .map((item) => item.revisionNumber),
        ) + 1,
      blockIds: blocks.map((block) => block.id),
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
      schemaVersion: caseStudy.schemaVersion,
    };
    const nextCaseStudy: CaseStudy = {
      ...caseStudy,
      status: "draft",
      currentRevisionId: revision.id,
      updatedAt: now,
    };
    delete nextCaseStudy.finalizedAt;
    await this.repository.createCaseStudyRevisionWithBlocks(
      nextCaseStudy,
      revision,
      blocks,
    );
    return nextCaseStudy;
  }

  async createCapabilityClaim(
    input: CreateCapabilityClaimInput,
  ): Promise<CapabilityClaim> {
    const snapshot = await this.repository.getSnapshot();
    const caseStudy = snapshot.caseStudies.find(
      (item) => item.id === input.caseStudyId,
    );
    if (!caseStudy || caseStudy.status !== "finalized") {
      throw new Error("能力主张只能从已定稿的项目案例中开始。 ");
    }
    const title = input.title.trim();
    const statement = input.statement.trim();
    const context = input.context.trim();
    if (!title || !statement || !context) {
      throw new Error("能力主张需要标题、主张和情境说明。 ");
    }
    const claim: CapabilityClaim = {
      id: this.runtime.createId(),
      createdAt: this.runtime.now(),
      updatedAt: this.runtime.now(),
      schemaVersion: 1,
      title,
      statement,
      scope: "single_project",
      reviewState: "draft",
      authoredBy: "user",
      context,
      behaviorEvidenceIds: uniqueIds(input.behaviorEvidenceIds),
      outcomeEvidenceIds: uniqueIds(input.outcomeEvidenceIds),
      feedbackEvidenceIds: uniqueIds(input.feedbackEvidenceIds),
      caseStudyIds: [caseStudy.id],
      ...(input.limitations?.trim()
        ? { limitations: input.limitations.trim() }
        : {
            limitations:
              "目前只由一个项目支持，不能证明在其他情境中也能稳定复现。",
          }),
    };
    validateCapabilityEvidenceSelection(
      claim,
      caseStudy,
      snapshot.evidenceItems,
    );
    assertCapabilityWordingMatchesScope(claim);
    await this.repository.createCapabilityClaim(claim);
    return claim;
  }

  async updateCapabilityClaim(
    claimId: string,
    input: Omit<CreateCapabilityClaimInput, "caseStudyId"> & {
      caseStudyId?: string;
    },
  ): Promise<CapabilityClaim> {
    const snapshot = await this.repository.getSnapshot();
    const claim = snapshot.capabilityClaims.find((item) => item.id === claimId);
    if (!claim) throw new Error("没有找到这条能力主张。 ");
    if (claim.reviewState === "confirmed") {
      throw new Error("已确认的能力主张不能直接修改，请先保留为新主张。 ");
    }
    const caseStudyId = input.caseStudyId ?? claim.caseStudyIds[0];
    const caseStudy = snapshot.caseStudies.find(
      (item) => item.id === caseStudyId,
    );
    if (!caseStudy || caseStudy.status !== "finalized") {
      throw new Error("能力主张只能引用已定稿的项目案例。 ");
    }
    const title = input.title.trim();
    const statement = input.statement.trim();
    const context = input.context.trim();
    if (!title || !statement || !context) {
      throw new Error("能力主张需要标题、主张和情境说明。 ");
    }
    const updated: CapabilityClaim = {
      ...claim,
      title,
      statement,
      context,
      behaviorEvidenceIds: uniqueIds(input.behaviorEvidenceIds),
      outcomeEvidenceIds: uniqueIds(input.outcomeEvidenceIds),
      feedbackEvidenceIds: uniqueIds(input.feedbackEvidenceIds),
      caseStudyIds: [caseStudy.id],
      ...(input.limitations?.trim()
        ? { limitations: input.limitations.trim() }
        : {
            limitations:
              "目前只由一个项目支持，不能证明在其他情境中也能稳定复现。",
          }),
      authoredBy: "user",
      reviewState: "draft",
      updatedAt: this.runtime.now(),
    };
    validateCapabilityEvidenceSelection(
      updated,
      caseStudy,
      snapshot.evidenceItems,
    );
    assertCapabilityWordingMatchesScope(updated);
    await this.repository.updateCapabilityClaim(updated);
    return updated;
  }

  async confirmCapabilityClaim(claimId: string): Promise<CapabilityClaim> {
    const snapshot = await this.repository.getSnapshot();
    const claim = snapshot.capabilityClaims.find((item) => item.id === claimId);
    if (!claim) throw new Error("没有找到这条能力主张。 ");
    if (claim.reviewState === "confirmed") return claim;
    const confirmed: CapabilityClaim = {
      ...claim,
      reviewState: "confirmed",
      updatedAt: this.runtime.now(),
    };
    assertCapabilityWordingMatchesScope(confirmed);
    assertCapabilityClaimConfirmable(
      confirmed,
      snapshot.evidenceItems,
      snapshot.caseStudies,
    );
    await this.repository.updateCapabilityClaim(confirmed);
    return confirmed;
  }

  async rejectCapabilityClaim(claimId: string): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const claim = snapshot.capabilityClaims.find((item) => item.id === claimId);
    if (!claim) throw new Error("没有找到这条能力主张。 ");
    if (claim.reviewState === "confirmed") {
      throw new Error("已确认的能力主张不能直接拒绝。 ");
    }
    await this.repository.updateCapabilityClaim({
      ...claim,
      reviewState: "rejected",
      updatedAt: this.runtime.now(),
    });
  }

  async initializeEmptyWorkspace(): Promise<void> {
    const now = this.runtime.now();
    const settings: WorkspaceSettings = {
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      displayName: "我的工作证据册",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      weekStartsOn: 1,
      aiMode: "off",
      demoDataLoaded: false,
    };

    await this.repository.saveWorkspaceSettings(settings);
  }

  async createRecord(input: CreateRecordInput): Promise<SourceRecord> {
    const originalText = input.originalText.trim();
    if (!originalText) {
      throw new Error("请先写下一点真实发生的事情。 ");
    }

    const now = this.runtime.now();
    const recordId = this.runtime.createId();
    const revisionId = this.runtime.createId();
    const structuredInput = cleanStructuredFields(input.structuredInput);

    const record: SourceRecord = {
      id: recordId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      occurredOn: input.occurredOn,
      ...(input.projectId === undefined ? {} : { projectId: input.projectId }),
      originalText,
      ...(structuredInput === undefined
        ? {}
        : { originalStructuredInput: structuredInput }),
      currentRevisionId: revisionId,
      lifecycle: "active",
    };
    const revision: RecordRevision = {
      id: revisionId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      recordId,
      revisionNumber: 1,
      text: originalText,
      ...(structuredInput === undefined ? {} : { structuredInput }),
      author: "user",
    };

    await this.repository.createRecord(record, revision);
    return record;
  }

  async reviseRecord(
    recordId: string,
    text: string,
    changeNote?: string,
  ): Promise<RecordRevision> {
    const snapshot = await this.repository.getSnapshot();
    const record = snapshot.records.find((item) => item.id === recordId);
    if (!record) {
      throw new Error("没有找到这条原始记录。 ");
    }
    const currentRevision = snapshot.revisions.find(
      (item) => item.id === record.currentRevisionId,
    );

    const nextText = text.trim();
    if (!nextText) {
      throw new Error("修订内容不能为空。 ");
    }

    const revisionNumber =
      Math.max(
        0,
        ...snapshot.revisions
          .filter((revision) => revision.recordId === recordId)
          .map((revision) => revision.revisionNumber),
      ) + 1;
    const now = this.runtime.now();
    const revision: RecordRevision = {
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      recordId,
      revisionNumber,
      text: nextText,
      ...(currentRevision?.structuredInput
        ? { structuredInput: currentRevision.structuredInput }
        : {}),
      ...(changeNote?.trim() ? { changeNote: changeNote.trim() } : {}),
      author: "user",
    };

    const updatedCitations = snapshot.citations
      .filter((citation) => citation.recordId === recordId)
      .map((citation) => ({
        ...citation,
        validity: citationMatchesRevision(citation, revision)
          ? ("valid" as const)
          : ("stale" as const),
        updatedAt: now,
      }));

    await this.repository.addRecordRevision(
      { ...record, currentRevisionId: revision.id, updatedAt: now },
      revision,
      updatedCitations,
    );
    return revision;
  }

  async createConfirmedEvidence(
    input: CreateEvidenceInput,
  ): Promise<EvidenceItem> {
    const snapshot = await this.repository.getSnapshot();
    const record = snapshot.records.find((item) => item.id === input.recordId);
    const revision = snapshot.revisions.find(
      (item) => item.id === record?.currentRevisionId,
    );
    if (!record || !revision) {
      throw new Error("无法找到这条证据对应的原始记录。 ");
    }

    const statement = input.statement.trim();
    if (!statement) {
      throw new Error("证据陈述不能为空。 ");
    }

    const now = this.runtime.now();
    const citation: Citation = {
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      targetKind: "source_record_revision",
      targetId: revision.id,
      recordId: record.id,
      quoteSnapshot: revision.text,
      validity: "valid",
    };
    const draft: EvidenceItem = {
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      occurredOn: record.occurredOn,
      ...(record.projectId === undefined
        ? {}
        : { projectId: record.projectId }),
      type: input.type,
      statement,
      epistemicKind:
        input.type === "hypothesis" ? "hypothesis" : input.epistemicKind,
      ...(input.type === "result"
        ? { resultStage: input.resultStage ?? "interim" }
        : {}),
      reviewState: "draft",
      authoredBy: "user",
      confirmedByUser: false,
      citationIds: [citation.id],
    };
    const confirmed = applyEvidenceConfirmation(draft, [citation], now);

    await this.repository.createEvidence(confirmed, citation);
    return confirmed;
  }

  async createStructuredCandidates(recordId: string): Promise<EvidenceItem[]> {
    const snapshot = await this.repository.getSnapshot();
    const record = snapshot.records.find((item) => item.id === recordId);
    const revision = snapshot.revisions.find(
      (item) => item.id === record?.currentRevisionId,
    );
    if (!record || !revision) {
      throw new Error("没有找到可整理的记录。 ");
    }

    const fields = revision.structuredInput ?? record.originalStructuredInput;
    if (!fields) {
      return [];
    }

    const proposals: Array<{
      value: string | undefined;
      type: EvidenceType;
      epistemicKind: EpistemicKind;
      fieldPath: string;
    }> = [
      {
        value: fields.action,
        type: "action",
        epistemicKind: "observed_fact",
        fieldPath: "structuredInput.action",
      },
      {
        value: fields.problem,
        type: "problem",
        epistemicKind: "user_judgment",
        fieldPath: "structuredInput.problem",
      },
      {
        value: fields.currentResult,
        type: "result",
        epistemicKind: "observed_fact",
        fieldPath: "structuredInput.currentResult",
      },
      {
        value: fields.oneLineJudgment,
        type: "learning",
        epistemicKind: "user_judgment",
        fieldPath: "structuredInput.oneLineJudgment",
      },
    ];

    const existingFieldPaths = new Set(
      snapshot.citations
        .filter(
          (citation) =>
            citation.recordId === recordId &&
            citation.targetId === revision.id &&
            citation.fieldPath,
        )
        .map((citation) => citation.fieldPath),
    );

    const created: EvidenceItem[] = [];
    for (const proposal of proposals) {
      const statement = proposal.value?.trim();
      if (!statement || existingFieldPaths.has(proposal.fieldPath)) continue;

      const now = this.runtime.now();
      const citation: Citation = {
        id: this.runtime.createId(),
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
        targetKind: "source_record_revision",
        targetId: revision.id,
        recordId: record.id,
        quoteSnapshot: statement,
        fieldPath: proposal.fieldPath,
        validity: "valid",
      };
      const evidence: EvidenceItem = {
        id: this.runtime.createId(),
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
        occurredOn: record.occurredOn,
        ...(record.projectId === undefined
          ? {}
          : { projectId: record.projectId }),
        type: proposal.type,
        statement,
        epistemicKind: proposal.epistemicKind,
        reviewState: "proposed",
        ...(proposal.type === "result" ? { resultStage: "interim" } : {}),
        authoredBy: "system",
        confirmedByUser: false,
        citationIds: [citation.id],
      };

      await this.repository.createEvidence(evidence, citation);
      created.push(evidence);
    }

    return created;
  }

  async createTextCandidates(recordId: string): Promise<EvidenceItem[]> {
    const snapshot = await this.repository.getSnapshot();
    const record = snapshot.records.find((item) => item.id === recordId);
    const revision = snapshot.revisions.find(
      (item) => item.id === record?.currentRevisionId,
    );
    if (!record || !revision) {
      throw new Error("没有找到可整理的记录。 ");
    }

    const existingQuotes = new Set(
      snapshot.citations
        .filter(
          (citation) =>
            citation.recordId === recordId &&
            citation.targetId === revision.id &&
            citation.fieldPath === "originalText",
        )
        .map((citation) => citation.quoteSnapshot),
    );
    const proposals = extractTextEvidenceProposals(revision.text).filter(
      (proposal) => !existingQuotes.has(proposal.quoteSnapshot),
    );
    if (proposals.length === 0) return [];

    const now = this.runtime.now();
    const citations: Citation[] = proposals.map((proposal) => ({
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      targetKind: "source_record_revision",
      targetId: revision.id,
      recordId: record.id,
      quoteSnapshot: proposal.quoteSnapshot,
      fieldPath: "originalText",
      charRange: proposal.charRange,
      validity: "valid",
    }));
    const evidenceItems: EvidenceItem[] = proposals.map((proposal, index) => ({
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      occurredOn: record.occurredOn,
      ...(record.projectId === undefined
        ? {}
        : { projectId: record.projectId }),
      type: proposal.type,
      statement: proposal.statement,
      epistemicKind: proposal.epistemicKind,
      reviewState: "proposed",
      ...(proposal.type === "result" ? { resultStage: "interim" } : {}),
      authoredBy: "system",
      confirmedByUser: false,
      citationIds: [citations[index]!.id],
    }));

    evidenceItems.forEach(assertEvidenceShape);
    await this.repository.createEvidenceBatch(evidenceItems, citations);
    return evidenceItems;
  }

  /**
   * 通过独立 AI 适配层生成“待确认”证据。所有候选都必须引用本次记录的
   * 当前修订；适配器返回异常或引用越界时，数据库不会写入半成品。
   */
  async createAiEvidenceCandidates(recordId: string): Promise<EvidenceItem[]> {
    const snapshot = await this.repository.getSnapshot();
    const record = snapshot.records.find((item) => item.id === recordId);
    const revision = snapshot.revisions.find(
      (item) => item.id === record?.currentRevisionId,
    );
    if (!record || !revision) {
      throw new Error("没有找到可整理的记录。 ");
    }
    const aiAdapter = this.assertAiAvailable(snapshot.settings);

    const existingQuotes = new Set(
      snapshot.citations
        .filter(
          (citation) =>
            citation.recordId === record.id &&
            citation.targetId === revision.id &&
            citation.fieldPath === "originalText",
        )
        .map((citation) => citation.quoteSnapshot),
    );
    const sourceProposals = extractTextEvidenceProposals(revision.text).filter(
      (proposal) => !existingQuotes.has(proposal.quoteSnapshot),
    );
    if (sourceProposals.length === 0) return [];

    const now = this.runtime.now();
    const runId = this.runtime.createId();
    const startedAt = now;
    const citations: Citation[] = sourceProposals.map((proposal) => ({
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      targetKind: "source_record_revision",
      targetId: revision.id,
      recordId: record.id,
      quoteSnapshot: proposal.quoteSnapshot,
      fieldPath: "originalText",
      charRange: proposal.charRange,
      validity: "valid",
    }));
    const sourceCandidates: EvidenceSourceCandidate[] = sourceProposals.map(
      (proposal, index) => ({
        citationId: citations[index]!.id,
        quoteSnapshot: proposal.quoteSnapshot,
        charRange: proposal.charRange,
        statement: proposal.statement,
        type: proposal.type,
        epistemicKind: proposal.epistemicKind,
        occurredOn: record.occurredOn,
      }),
    );
    const candidateCitationIds = new Set(
      sourceCandidates.map((candidate) => candidate.citationId),
    );
    const inputRefs = [
      { kind: "source_record", id: record.id, revisionId: revision.id },
    ];
    const baseRun = {
      id: runId,
      createdAt: startedAt,
      updatedAt: startedAt,
      schemaVersion: 1,
      task: "extract_evidence" as const,
      adapter: aiAdapter.kind,
      modelLabel:
        aiAdapter.kind === "demo" ? "Trace 演示适配器（无网络）" : "自定义端点",
      promptVersion:
        aiAdapter.kind === "demo" ? "demo-evidence-v1" : "trace-custom-v1",
      inputRefs,
      startedAt,
      outputEntityIds: [],
    };

    try {
      const proposals = await aiAdapter.extractEvidence({
        recordId: record.id,
        revisionId: revision.id,
        originalText: revision.text,
        occurredOn: record.occurredOn,
        sourceCandidates,
      });
      const evidenceItems: EvidenceItem[] = proposals.map(
        (proposal: EvidenceProposal) => {
          if (!proposal.statement.trim()) {
            throw new Error("AI 响应缺少证据陈述。 ");
          }
          if (proposal.occurredOn !== record.occurredOn) {
            throw new Error("AI 响应修改了证据日期，已安全拒绝写入。 ");
          }
          const sourceCitationIds = [...new Set(proposal.sourceCitationIds)];
          if (
            sourceCitationIds.length === 0 ||
            sourceCitationIds.some((id) => !candidateCitationIds.has(id))
          ) {
            throw new Error(
              "AI 响应包含不存在或缺失的原文引用，已安全拒绝写入。 ",
            );
          }
          const evidence: EvidenceItem = {
            id: this.runtime.createId(),
            createdAt: now,
            updatedAt: now,
            schemaVersion: 1,
            occurredOn: record.occurredOn,
            ...(record.projectId === undefined
              ? {}
              : { projectId: record.projectId }),
            type: proposal.type,
            statement: proposal.statement.trim(),
            epistemicKind: proposal.epistemicKind,
            ...(proposal.type === "result" ? { resultStage: "interim" } : {}),
            reviewState: "proposed",
            authoredBy: "ai",
            aiRunId: runId,
            confirmedByUser: false,
            citationIds: sourceCitationIds,
          };
          assertEvidenceShape(evidence);
          assertAiEvidenceStartsAsProposal(evidence);
          return evidence;
        },
      );
      const aiRun = {
        ...baseRun,
        status: "succeeded" as const,
        completedAt: this.runtime.now(),
        outputEntityIds: evidenceItems.map((item) => item.id),
        updatedAt: this.runtime.now(),
      };
      await this.repository.createAiRunWithEvidence(
        aiRun,
        evidenceItems,
        citations.filter((citation) =>
          evidenceItems.some((item) => item.citationIds.includes(citation.id)),
        ),
      );
      return evidenceItems;
    } catch (caught) {
      const failedRun = {
        ...baseRun,
        status: "failed" as const,
        completedAt: this.runtime.now(),
        updatedAt: this.runtime.now(),
        errorCode: "AI_RESPONSE_INVALID",
      };
      await this.repository.createAiRun(failedRun).catch(() => undefined);
      const message = caught instanceof Error ? caught.message : "未知错误";
      throw new Error(`AI 整理未完成：${message}`, { cause: caught });
    }
  }

  async reframeTextCandidates(recordId: string): Promise<number> {
    const snapshot = await this.repository.getSnapshot();
    const record = snapshot.records.find((item) => item.id === recordId);
    const revision = snapshot.revisions.find(
      (item) => item.id === record?.currentRevisionId,
    );
    if (!record || !revision) {
      throw new Error("没有找到可重新整理的记录。 ");
    }

    const proposals = extractTextEvidenceProposals(revision.text);
    const citationsById = new Map(
      snapshot.citations.map((citation) => [citation.id, citation]),
    );
    const legacyCandidates = snapshot.evidenceItems.filter(
      (evidence) =>
        evidence.authoredBy === "system" &&
        evidence.reviewState !== "rejected" &&
        evidence.citationIds.some((citationId) => {
          const citation = citationsById.get(citationId);
          return (
            citation?.recordId === recordId &&
            citation.targetId === revision.id &&
            citation.fieldPath === "originalText"
          );
        }),
    );
    const consumed = new Set<string>();
    let updatedCount = 0;
    const newEvidence: EvidenceItem[] = [];
    const newCitations: Citation[] = [];

    for (const proposal of proposals) {
      const matching = legacyCandidates
        .filter((evidence) => !consumed.has(evidence.id))
        .map((evidence) => ({
          evidence,
          citation: evidence.citationIds
            .map((citationId) => citationsById.get(citationId))
            .find(
              (citation) =>
                citation?.recordId === recordId &&
                citation.targetId === revision.id &&
                citation.fieldPath === "originalText",
            ),
        }))
        .filter(
          (
            item,
          ): item is {
            evidence: EvidenceItem;
            citation: Citation;
          } => item.citation !== undefined,
        );
      const exact = matching.find(
        (item) => item.citation.quoteSnapshot === proposal.quoteSnapshot,
      );
      const grouped = exact
        ? [exact]
        : matching.filter((item) =>
            proposal.quoteSnapshot.includes(item.citation.quoteSnapshot),
          );
      const target = grouped[0];

      if (!target) {
        const now = this.runtime.now();
        const citation: Citation = {
          id: this.runtime.createId(),
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
          targetKind: "source_record_revision",
          targetId: revision.id,
          recordId: record.id,
          quoteSnapshot: proposal.quoteSnapshot,
          fieldPath: "originalText",
          charRange: proposal.charRange,
          validity: "valid",
        };
        const evidence: EvidenceItem = {
          id: this.runtime.createId(),
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
          occurredOn: record.occurredOn,
          ...(record.projectId === undefined
            ? {}
            : { projectId: record.projectId }),
          type: proposal.type,
          statement: proposal.statement,
          epistemicKind: proposal.epistemicKind,
          reviewState: "proposed",
          ...(proposal.type === "result" ? { resultStage: "interim" } : {}),
          authoredBy: "system",
          confirmedByUser: false,
          citationIds: [citation.id],
        };
        assertEvidenceShape(evidence);
        newCitations.push(citation);
        newEvidence.push(evidence);
        updatedCount += 1;
        continue;
      }

      consumed.add(target.evidence.id);
      const now = this.runtime.now();
      if (target.citation.quoteSnapshot !== proposal.quoteSnapshot) {
        await this.repository.updateCitation({
          ...target.citation,
          targetId: revision.id,
          quoteSnapshot: proposal.quoteSnapshot,
          charRange: proposal.charRange,
          validity: "valid",
          updatedAt: now,
        });
      }
      if (
        target.evidence.statement !== proposal.statement ||
        target.evidence.type !== proposal.type
      ) {
        const updated: EvidenceItem = {
          ...target.evidence,
          type: proposal.type,
          statement: proposal.statement,
          epistemicKind: proposal.epistemicKind,
          updatedAt: now,
        };
        assertEvidenceShape(updated);
        await this.repository.updateEvidence(updated);
        updatedCount += 1;
      }
      for (const duplicate of grouped.slice(1)) {
        consumed.add(duplicate.evidence.id);
        const duplicateUpdate: EvidenceItem = {
          ...duplicate.evidence,
          reviewState: "rejected",
          confirmedByUser: false,
          rejectionReason:
            "在用户主动重新整理时，已与另一段原文合并为更完整的证据表达。",
          updatedAt: now,
        };
        delete duplicateUpdate.confirmedAt;
        await this.repository.updateEvidence(duplicateUpdate);
        updatedCount += 1;
      }
    }
    if (newEvidence.length > 0) {
      await this.repository.createEvidenceBatch(newEvidence, newCitations);
    }
    return updatedCount;
  }

  async ensureWeeklyReview(
    weekStart: ISODate,
    weekEnd: ISODate,
  ): Promise<WeeklyReview> {
    const snapshot = await this.repository.getSnapshot();
    const existing = snapshot.weeklyReviews.find(
      (review) => review.weekStart === weekStart,
    );
    if (existing) return existing;

    const now = this.runtime.now();
    const reviewId = this.runtime.createId();
    const revisionId = this.runtime.createId();
    const review: WeeklyReview = {
      id: reviewId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      weekStart,
      weekEnd,
      timezone: snapshot.settings?.timezone ?? "Asia/Shanghai",
      status: "draft",
      currentRevisionId: revisionId,
    };
    const revision: WeeklyReviewRevision = {
      id: revisionId,
      weeklyReviewId: reviewId,
      revisionNumber: 1,
      statusSnapshot: "draft",
      blockIds: [],
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
    };
    await this.repository.createWeeklyReview(review, revision);
    return review;
  }

  async assembleWeeklyCandidates(reviewId: string): Promise<OutputBlock[]> {
    const snapshot = await this.repository.getSnapshot();
    const review = snapshot.weeklyReviews.find((item) => item.id === reviewId);
    const revision = snapshot.weeklyReviewRevisions.find(
      (item) => item.id === review?.currentRevisionId,
    );
    if (!review || !revision) throw new Error("没有找到这份周报草稿。 ");
    if (review.status === "finalized") {
      throw new Error("这份周报已经定稿，请先开始一个新修订。 ");
    }

    const existingKeys = new Set(
      snapshot.outputBlocks
        .filter(
          (block) =>
            block.ownerKind === "weekly_review_revision" &&
            block.ownerId === revision.id,
        )
        .map((block) =>
          weeklyBlockKey(
            block.sectionKey as WeeklySectionKey,
            block.content,
            block.citationIds,
          ),
        ),
    );
    const citations = new Map(
      snapshot.citations.map((item) => [item.id, item]),
    );
    const confirmedEvidence = snapshot.evidenceItems.filter(
      (evidence) =>
        evidence.reviewState === "confirmed" &&
        evidence.occurredOn >= review.weekStart &&
        evidence.occurredOn <= review.weekEnd,
    );
    const candidates: OutputBlock[] = [];
    for (const evidence of confirmedEvidence) {
      const sectionKey = sectionForEvidence(evidence.type);
      if (!sectionKey) continue;
      const citationIds = evidence.citationIds.filter(
        (id) => citations.get(id)?.validity === "valid",
      );
      const key = weeklyBlockKey(sectionKey, evidence.statement, citationIds);
      if (existingKeys.has(key)) continue;
      const now = this.runtime.now();
      const block: OutputBlock = {
        id: this.runtime.createId(),
        createdAt: now,
        updatedAt: now,
        schemaVersion: 1,
        ownerKind: "weekly_review_revision",
        ownerId: revision.id,
        sectionKey,
        order: candidates.length,
        content: evidence.statement,
        epistemicKind: evidence.epistemicKind,
        reviewState: "proposed",
        authoredBy: "system",
        citationIds,
      };
      candidates.push(block);
      existingKeys.add(key);
    }
    if (candidates.length === 0) return [];
    const nextRevision = {
      ...revision,
      blockIds: [...revision.blockIds, ...candidates.map((block) => block.id)],
      updatedAt: this.runtime.now(),
    };
    await this.repository.createOutputBlocksWithRevision(
      candidates,
      nextRevision,
    );
    return candidates;
  }

  async draftAiWeeklyCandidates(reviewId: string): Promise<OutputBlock[]> {
    const snapshot = await this.repository.getSnapshot();
    const review = snapshot.weeklyReviews.find((item) => item.id === reviewId);
    const revision = snapshot.weeklyReviewRevisions.find(
      (item) => item.id === review?.currentRevisionId,
    );
    if (!review || !revision) throw new Error("没有找到这份周报草稿。 ");
    if (review.status === "finalized") {
      throw new Error("这份周报已经定稿，请先开始一个新修订。 ");
    }
    const aiAdapter = this.assertAiAvailable(snapshot.settings);
    const evidence = snapshot.evidenceItems.filter(
      (item) =>
        item.reviewState === "confirmed" &&
        item.occurredOn >= review.weekStart &&
        item.occurredOn <= review.weekEnd,
    );
    if (evidence.length === 0) return [];

    const now = this.runtime.now();
    const runId = this.runtime.createId();
    const baseRun = {
      id: runId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      task: "draft_weekly_review" as const,
      adapter: aiAdapter.kind,
      modelLabel:
        aiAdapter.kind === "demo" ? "Trace 演示适配器（无网络）" : "自定义端点",
      promptVersion:
        aiAdapter.kind === "demo" ? "demo-weekly-v1" : "trace-custom-v1",
      inputRefs: [
        { kind: "weekly_review", id: review.id, revisionId: revision.id },
        ...evidence.map((item) => ({ kind: "evidence", id: item.id })),
      ],
      outputEntityIds: [],
      startedAt: now,
    };
    const knownCitationIds = new Set(
      evidence.flatMap((item) => item.citationIds),
    );
    try {
      const proposals = await aiAdapter.draftWeeklyReview({
        weeklyReviewId: review.id,
        evidence: evidence.map((item) => ({
          id: item.id,
          statement: item.statement,
          type: item.type,
          epistemicKind: item.epistemicKind,
          occurredOn: item.occurredOn,
          citationIds: item.citationIds,
        })),
      });
      const existingKeys = new Set(
        snapshot.outputBlocks
          .filter((block) => block.ownerId === revision.id)
          .map((block) =>
            weeklyBlockKey(
              block.sectionKey as WeeklySectionKey,
              block.content,
              block.citationIds,
            ),
          ),
      );
      const blocks: OutputBlock[] = [];
      for (const proposal of proposals) {
        validateAiOutputProposal(proposal, knownCitationIds);
        const citationIds = [...new Set(proposal.sourceCitationIds)];
        const key = weeklyBlockKey(
          proposal.sectionKey as WeeklySectionKey,
          proposal.content.trim(),
          citationIds,
        );
        if (existingKeys.has(key)) continue;
        const block: OutputBlock = {
          id: this.runtime.createId(),
          createdAt: now,
          updatedAt: now,
          schemaVersion: 1,
          ownerKind: "weekly_review_revision",
          ownerId: revision.id,
          sectionKey: proposal.sectionKey,
          order: revision.blockIds.length + blocks.length,
          content: proposal.content.trim(),
          epistemicKind: proposal.epistemicKind,
          reviewState: "proposed",
          authoredBy: "ai",
          authorshipNote: "ai_drafted",
          aiRunId: runId,
          citationIds,
        };
        blocks.push(block);
        existingKeys.add(key);
      }
      const nextRevision: WeeklyReviewRevision = {
        ...revision,
        blockIds: [...revision.blockIds, ...blocks.map((block) => block.id)],
        updatedAt: this.runtime.now(),
      };
      const aiRun = {
        ...baseRun,
        status: "succeeded" as const,
        completedAt: this.runtime.now(),
        updatedAt: this.runtime.now(),
        outputEntityIds: blocks.map((block) => block.id),
      };
      await this.repository.createAiRunWithWeeklyBlocks(
        aiRun,
        blocks,
        nextRevision,
      );
      return blocks;
    } catch (caught) {
      await this.repository
        .createAiRun({
          ...baseRun,
          status: "failed" as const,
          completedAt: this.runtime.now(),
          updatedAt: this.runtime.now(),
          errorCode: "AI_RESPONSE_INVALID",
        })
        .catch(() => undefined);
      const message = caught instanceof Error ? caught.message : "未知错误";
      throw new Error(`AI 周报草稿未完成：${message}`, { cause: caught });
    }
  }

  async createWeeklyBlock(input: CreateWeeklyBlockInput): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const review = snapshot.weeklyReviews.find(
      (item) => item.id === input.reviewId,
    );
    const revision = snapshot.weeklyReviewRevisions.find(
      (item) => item.id === review?.currentRevisionId,
    );
    if (!review || !revision) throw new Error("没有找到这份周报草稿。 ");
    if (review.status === "finalized") {
      throw new Error("定稿周报不能直接添加内容，请先开始一个新修订。 ");
    }
    const content = input.content.trim();
    if (!content) throw new Error("周报内容不能为空。 ");
    const now = this.runtime.now();
    const block: OutputBlock = {
      id: this.runtime.createId(),
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      ownerKind: "weekly_review_revision",
      ownerId: revision.id,
      sectionKey: input.sectionKey,
      order: revision.blockIds.length,
      content,
      epistemicKind: input.epistemicKind,
      reviewState: "draft",
      authoredBy: "user",
      authorshipNote: "user_written",
      citationIds: input.citationIds ?? [],
    };
    assertValidationBlockLinkedToHypothesis(
      block,
      snapshot.citations,
      snapshot.evidenceItems,
    );
    await this.repository.createOutputBlocksWithRevision([block], {
      ...revision,
      blockIds: [...revision.blockIds, block.id],
      updatedAt: now,
    });
    return block;
  }

  async updateWeeklyBlock(
    blockId: string,
    content: string,
    epistemicKind: EpistemicKind,
  ): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const block = snapshot.outputBlocks.find((item) => item.id === blockId);
    if (!block) throw new Error("没有找到这段周报内容。 ");
    const owningReview = snapshot.weeklyReviews.find((review) =>
      snapshot.weeklyReviewRevisions.some(
        (revision) =>
          revision.id === review.currentRevisionId &&
          revision.blockIds.includes(block.id),
      ),
    );
    if (owningReview?.status === "finalized") {
      throw new Error("定稿周报不能直接修改，请先开始一个新修订。 ");
    }
    const nextContent = content.trim();
    if (!nextContent) throw new Error("周报内容不能为空。 ");
    const updated: OutputBlock = {
      ...block,
      content: nextContent,
      epistemicKind,
      authoredBy: "user",
      authorshipNote:
        block.authoredBy === "system" || block.authoredBy === "ai"
          ? "ai_drafted_user_edited"
          : "user_written",
      reviewState: "draft",
      updatedAt: this.runtime.now(),
    };
    await this.repository.updateOutputBlock(updated);
    return updated;
  }

  async confirmWeeklyBlock(blockId: string): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const block = snapshot.outputBlocks.find((item) => item.id === blockId);
    if (!block) throw new Error("没有找到这段周报内容。 ");
    if (
      block.sectionKey === "personal_reflection" &&
      block.authoredBy === "ai"
    ) {
      throw new Error(
        "用户工作思考不能直接确认 AI 提问，请先编辑成你自己的思考。 ",
      );
    }
    const owningReview = snapshot.weeklyReviews.find((review) =>
      snapshot.weeklyReviewRevisions.some(
        (revision) =>
          revision.id === review.currentRevisionId &&
          revision.blockIds.includes(block.id),
      ),
    );
    if (owningReview?.status === "finalized") {
      throw new Error("定稿周报无需再次确认，请先开始一个新修订。 ");
    }
    const confirmed = {
      ...block,
      reviewState: "confirmed" as const,
      updatedAt: this.runtime.now(),
    };
    assertOutputBlockFinalizable(
      confirmed,
      snapshot.citations,
      snapshot.evidenceItems,
    );
    await this.repository.updateOutputBlock(confirmed);
    return confirmed;
  }

  async rejectWeeklyBlock(blockId: string): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const block = snapshot.outputBlocks.find((item) => item.id === blockId);
    if (!block || block.ownerKind !== "weekly_review_revision") {
      throw new Error("没有找到这段周报内容。 ");
    }
    const owningReview = snapshot.weeklyReviews.find((review) =>
      snapshot.weeklyReviewRevisions.some(
        (revision) =>
          revision.id === review.currentRevisionId &&
          revision.blockIds.includes(block.id),
      ),
    );
    if (owningReview?.status === "finalized") {
      throw new Error("定稿周报不能拒绝内容，请先开始新修订。 ");
    }
    const rejected: OutputBlock = {
      ...block,
      reviewState: "rejected",
      rejectionReason: "用户暂不采纳这段周报候选。",
      updatedAt: this.runtime.now(),
    };
    await this.repository.updateOutputBlock(rejected);
    return rejected;
  }

  async restoreWeeklyBlock(blockId: string): Promise<OutputBlock> {
    const snapshot = await this.repository.getSnapshot();
    const block = snapshot.outputBlocks.find((item) => item.id === blockId);
    if (!block || block.ownerKind !== "weekly_review_revision") {
      throw new Error("没有找到这段周报内容。 ");
    }
    if (block.reviewState !== "rejected") {
      throw new Error("只有已拒绝的周报内容可以恢复。 ");
    }
    const restored: OutputBlock = {
      ...block,
      reviewState: "proposed",
      updatedAt: this.runtime.now(),
    };
    delete restored.rejectionReason;
    await this.repository.updateOutputBlock(restored);
    return restored;
  }

  async finalizeWeeklyReview(reviewId: string): Promise<WeeklyReview> {
    const snapshot = await this.repository.getSnapshot();
    const review = snapshot.weeklyReviews.find((item) => item.id === reviewId);
    const revision = snapshot.weeklyReviewRevisions.find(
      (item) => item.id === review?.currentRevisionId,
    );
    if (!review || !revision) throw new Error("没有找到这份周报草稿。 ");
    if (review.status === "finalized") return review;

    const blocks = revision.blockIds
      .map((id) => snapshot.outputBlocks.find((block) => block.id === id))
      .filter(
        (block): block is OutputBlock =>
          block !== undefined && block.reviewState !== "rejected",
      )
      .sort((left, right) => left.order - right.order);
    const finalized = createFinalizedWeeklyRevision({
      review,
      priorRevisions: snapshot.weeklyReviewRevisions,
      blocks,
      citations: snapshot.citations,
      evidenceItems: snapshot.evidenceItems,
      revisionId: this.runtime.createId(),
      finalizedAt: this.runtime.now(),
    });
    await this.repository.finalizeWeeklyReview(
      finalized.review,
      finalized.revision,
    );
    return finalized.review;
  }

  async startWeeklyRevision(reviewId: string): Promise<WeeklyReview> {
    const snapshot = await this.repository.getSnapshot();
    const review = snapshot.weeklyReviews.find((item) => item.id === reviewId);
    const currentRevision = snapshot.weeklyReviewRevisions.find(
      (item) => item.id === review?.currentRevisionId,
    );
    if (!review || !currentRevision) throw new Error("没有找到这份周报。 ");
    if (review.status !== "finalized") return review;

    const now = this.runtime.now();
    const revisionId = this.runtime.createId();
    const blocks = currentRevision.blockIds
      .map((id) => snapshot.outputBlocks.find((block) => block.id === id))
      .filter((block): block is OutputBlock => block !== undefined)
      .sort((left, right) => left.order - right.order)
      .map((block) => ({
        ...block,
        id: this.runtime.createId(),
        createdAt: now,
        updatedAt: now,
        ownerId: revisionId,
      }));
    const revision: WeeklyReviewRevision = {
      id: revisionId,
      weeklyReviewId: review.id,
      revisionNumber:
        Math.max(
          0,
          ...snapshot.weeklyReviewRevisions
            .filter((item) => item.weeklyReviewId === review.id)
            .map((item) => item.revisionNumber),
        ) + 1,
      statusSnapshot: "draft",
      blockIds: blocks.map((block) => block.id),
      createdBy: "user",
      createdAt: now,
      updatedAt: now,
      schemaVersion: review.schemaVersion,
    };
    const nextReview: WeeklyReview = {
      ...review,
      status: "draft",
      currentRevisionId: revision.id,
      updatedAt: now,
    };
    delete nextReview.finalizedAt;
    await this.repository.createWeeklyRevisionWithBlocks(
      nextReview,
      revision,
      blocks,
    );
    return nextReview;
  }

  async confirmEvidence(evidenceId: string): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const evidence = snapshot.evidenceItems.find(
      (item) => item.id === evidenceId,
    );
    if (!evidence) throw new Error("没有找到这条候选证据。 ");
    const confirmed = applyEvidenceConfirmation(
      evidence,
      snapshot.citations,
      this.runtime.now(),
    );
    await this.repository.updateEvidence(confirmed);
  }

  async updateEvidence(
    evidenceId: string,
    input: Omit<CreateEvidenceInput, "recordId">,
  ): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const evidence = snapshot.evidenceItems.find(
      (item) => item.id === evidenceId,
    );
    if (!evidence) throw new Error("没有找到这条证据。 ");
    const statement = input.statement.trim();
    if (!statement) throw new Error("证据陈述不能为空。 ");
    const now = this.runtime.now();
    const updatedBase: EvidenceItem = {
      ...evidence,
      statement,
      type: input.type,
      epistemicKind:
        input.type === "hypothesis" ? "hypothesis" : input.epistemicKind,
      authoredBy: "user",
      updatedAt: now,
    };
    const updated: EvidenceItem =
      input.type === "result"
        ? { ...updatedBase, resultStage: input.resultStage ?? "interim" }
        : withoutResultStage(updatedBase);
    assertEvidenceShape(updated);
    await this.repository.updateEvidence(updated);
  }

  async repairCitation(citationId: string): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const citation = snapshot.citations.find((item) => item.id === citationId);
    const record = snapshot.records.find(
      (item) => item.id === citation?.recordId,
    );
    const revision = snapshot.revisions.find(
      (item) => item.id === record?.currentRevisionId,
    );
    if (!citation || !record || !revision) {
      throw new Error("无法找到这条引用的当前来源。 ");
    }
    const quoteSnapshot = citation.fieldPath
      ? structuredFieldValue(revision, citation.fieldPath)
      : revision.text;
    if (!quoteSnapshot)
      throw new Error("当前修订中没有可用于修复的来源内容。 ");
    await this.repository.updateCitation({
      ...citation,
      targetId: revision.id,
      quoteSnapshot,
      validity: "valid",
      updatedAt: this.runtime.now(),
    });
  }

  async rejectEvidence(evidenceId: string): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const evidence = snapshot.evidenceItems.find(
      (item) => item.id === evidenceId,
    );
    if (!evidence) throw new Error("没有找到这条候选证据。 ");
    const now = this.runtime.now();
    await this.repository.updateEvidence({
      ...evidence,
      reviewState: "rejected",
      confirmedByUser: false,
      updatedAt: now,
    });
  }

  async restoreEvidence(evidenceId: string): Promise<void> {
    const snapshot = await this.repository.getSnapshot();
    const evidence = snapshot.evidenceItems.find(
      (item) => item.id === evidenceId,
    );
    if (!evidence) throw new Error("没有找到这条证据。");
    if (evidence.reviewState !== "rejected") {
      throw new Error("只有已拒绝的证据可以恢复为待确认状态。");
    }
    const restored: EvidenceItem = {
      ...evidence,
      reviewState: "draft",
      confirmedByUser: false,
      updatedAt: this.runtime.now(),
    };
    delete restored.rejectionReason;
    delete restored.confirmedAt;
    await this.repository.updateEvidence(restored);
  }
}

function withoutResultStage(evidence: EvidenceItem): EvidenceItem {
  const withoutStage = { ...evidence };
  delete withoutStage.resultStage;
  return withoutStage;
}

function uniqueIds(ids: readonly string[]): string[] {
  return [...new Set(ids)];
}

function validateCapabilityEvidenceSelection(
  claim: CapabilityClaim,
  caseStudy: CaseStudy,
  evidenceItems: readonly EvidenceItem[],
): void {
  const includedIds = new Set(caseStudy.includedEvidenceIds);
  const evidenceById = new Map(
    evidenceItems.map((evidence) => [evidence.id, evidence]),
  );
  const allSelectedIds = [
    ...claim.behaviorEvidenceIds,
    ...claim.outcomeEvidenceIds,
    ...claim.feedbackEvidenceIds,
  ];
  for (const evidenceId of allSelectedIds) {
    const evidence = evidenceById.get(evidenceId);
    if (!evidence || !includedIds.has(evidenceId)) {
      throw new Error("能力主张只能引用这份案例纳入的证据。 ");
    }
    if (evidence.reviewState !== "confirmed") {
      throw new Error("能力主张只能引用已经确认的证据。 ");
    }
  }
  for (const evidenceId of claim.behaviorEvidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (
      evidence &&
      evidence.type !== "action" &&
      evidence.type !== "decision"
    ) {
      throw new Error("行为证据只能选择行动或决策类型。 ");
    }
  }
  for (const evidenceId of claim.outcomeEvidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (evidence && evidence.type !== "result") {
      throw new Error("结果证据只能选择结果类型。 ");
    }
  }
  for (const evidenceId of claim.feedbackEvidenceIds) {
    const evidence = evidenceById.get(evidenceId);
    if (evidence && evidence.type !== "feedback") {
      throw new Error("反馈证据只能选择反馈类型。 ");
    }
  }
}

function findCaseStudyOwner(
  block: OutputBlock | undefined,
  snapshot: Awaited<ReturnType<WorkbenchRepository["getSnapshot"]>>,
): { caseStudy: CaseStudy; revision: CaseStudyRevision } | undefined {
  if (!block || block.ownerKind !== "case_study_revision") return undefined;
  const revision = snapshot.caseStudyRevisions.find(
    (item) => item.id === block.ownerId,
  );
  const caseStudy = snapshot.caseStudies.find(
    (item) => item.id === revision?.caseStudyId,
  );
  if (!revision || !caseStudy) return undefined;
  return { caseStudy, revision };
}

function structuredFieldValue(
  revision: RecordRevision,
  fieldPath: string,
): string | undefined {
  if (fieldPath === "originalText") return revision.text;
  const key = fieldPath.replace(
    "structuredInput.",
    "",
  ) as keyof StructuredRecordFields;
  return revision.structuredInput?.[key]?.trim();
}

function citationMatchesRevision(
  citation: Citation,
  revision: RecordRevision,
): boolean {
  const currentText = citation.fieldPath
    ? structuredFieldValue(revision, citation.fieldPath)
    : revision.text;
  return Boolean(currentText?.includes(citation.quoteSnapshot));
}

function cleanStructuredFields(
  fields: StructuredRecordFields | undefined,
): StructuredRecordFields | undefined {
  if (!fields) return undefined;
  const cleaned: StructuredRecordFields = {};
  if (fields.action?.trim()) cleaned.action = fields.action.trim();
  if (fields.problem?.trim()) cleaned.problem = fields.problem.trim();
  if (fields.currentResult?.trim())
    cleaned.currentResult = fields.currentResult.trim();
  if (fields.oneLineJudgment?.trim())
    cleaned.oneLineJudgment = fields.oneLineJudgment.trim();
  return Object.keys(cleaned).length === 0 ? undefined : cleaned;
}

function sectionForEvidence(type: EvidenceType): WeeklySectionKey {
  switch (type) {
    case "action":
    case "decision":
      return "focus";
    case "result":
      return "results";
    case "problem":
      return "problems";
    case "feedback":
    case "learning":
      return "went_well";
    case "hypothesis":
      return "next_validations";
  }
}

function weeklyBlockKey(
  sectionKey: WeeklySectionKey,
  content: string,
  citationIds: readonly string[],
): string {
  return `${sectionKey}|${content}|${[...citationIds].sort().join(",")}`;
}

function validateAiOutputProposal(
  proposal: OutputBlockProposal,
  knownCitationIds: ReadonlySet<string>,
): void {
  if (!proposal.content.trim()) {
    throw new Error("AI 响应缺少内容块文本。 ");
  }
  const citationIds = [...new Set(proposal.sourceCitationIds)];
  if (
    citationIds.length === 0 ||
    citationIds.some((citationId) => !knownCitationIds.has(citationId))
  ) {
    throw new Error("AI 响应包含不存在或缺失的来源引用，已安全拒绝写入。 ");
  }
}
