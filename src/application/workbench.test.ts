import { beforeEach, describe, expect, it } from "vitest";
import type {
  WorkbenchRepository,
  WorkbenchSnapshot,
} from "./ports/workbenchRepository";
import { WorkbenchService } from "./workbench";
import type { AiAdapter } from "./ports/aiAdapter";
import { DemoAiAdapter } from "../infrastructure/ai/demoAiAdapter";
import type {
  CaseStudy,
  CaseStudyRevision,
  CapabilityClaim,
  Citation,
  EvidenceItem,
  OutputBlock,
  AiRun,
  Project,
  RecordRevision,
  SourceRecord,
  WeeklyReview,
  WeeklyReviewRevision,
  WorkspaceSettings,
} from "../domain/model";

class MemoryWorkbenchRepository implements WorkbenchRepository {
  snapshot: WorkbenchSnapshot = {
    projects: [],
    records: [],
    revisions: [],
    importBatches: [],
    evidenceItems: [],
    citations: [],
    weeklyReviews: [],
    weeklyReviewRevisions: [],
    caseStudies: [],
    caseStudyRevisions: [],
    capabilityClaims: [],
    outputBlocks: [],
    aiRuns: [],
  };

  async getSnapshot() {
    return this.snapshot;
  }
  async saveWorkspaceSettings(settings: WorkspaceSettings) {
    this.snapshot.settings = settings;
  }
  async createProject(project: Project) {
    this.snapshot.projects.push(project);
  }
  async updateProject(project: Project) {
    this.snapshot.projects = this.snapshot.projects.map((item) =>
      item.id === project.id ? project : item,
    );
  }
  async updateRecord(record: SourceRecord) {
    this.snapshot.records = this.snapshot.records.map((item) =>
      item.id === record.id ? record : item,
    );
  }
  async createRecord(record: SourceRecord, revision: RecordRevision) {
    this.snapshot.records.push(record);
    this.snapshot.revisions.push(revision);
  }
  async addRecordRevision(record: SourceRecord, revision: RecordRevision) {
    this.snapshot.records = this.snapshot.records.map((item) =>
      item.id === record.id ? record : item,
    );
    this.snapshot.revisions.push(revision);
  }
  async createEvidence(evidence: EvidenceItem, citation: Citation) {
    this.snapshot.evidenceItems.push(evidence);
    this.snapshot.citations.push(citation);
  }
  async createEvidenceBatch(evidence: EvidenceItem[], citations: Citation[]) {
    this.snapshot.evidenceItems.push(...evidence);
    this.snapshot.citations.push(...citations);
  }
  async updateEvidence(evidence: EvidenceItem) {
    this.snapshot.evidenceItems = this.snapshot.evidenceItems.map((item) =>
      item.id === evidence.id ? evidence : item,
    );
  }
  async updateCitation(citation: Citation) {
    this.snapshot.citations = this.snapshot.citations.map((item) =>
      item.id === citation.id ? citation : item,
    );
  }
  async createWeeklyReview(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    this.snapshot.weeklyReviews.push(review);
    this.snapshot.weeklyReviewRevisions.push(revision);
  }
  async createCaseStudyWithRevision(
    caseStudy: CaseStudy,
    revision: CaseStudyRevision,
    blocks: OutputBlock[],
  ) {
    this.snapshot.caseStudies.push(caseStudy);
    this.snapshot.caseStudyRevisions.push(revision);
    this.snapshot.outputBlocks.push(...blocks);
  }
  async updateCaseStudy(caseStudy: CaseStudy) {
    this.snapshot.caseStudies = this.snapshot.caseStudies.map((item) =>
      item.id === caseStudy.id ? caseStudy : item,
    );
  }
  async createCaseStudyRevisionWithBlocks(
    caseStudy: CaseStudy,
    revision: CaseStudyRevision,
    blocks: OutputBlock[],
  ) {
    await this.updateCaseStudy(caseStudy);
    this.snapshot.caseStudyRevisions.push(revision);
    this.snapshot.outputBlocks.push(...blocks);
  }
  async finalizeCaseStudy(caseStudy: CaseStudy, revision: CaseStudyRevision) {
    await this.updateCaseStudy(caseStudy);
    this.snapshot.caseStudyRevisions.push(revision);
  }
  async createCapabilityClaim(claim: CapabilityClaim) {
    this.snapshot.capabilityClaims.push(claim);
  }
  async updateCapabilityClaim(claim: CapabilityClaim) {
    this.snapshot.capabilityClaims = this.snapshot.capabilityClaims.map(
      (item) => (item.id === claim.id ? claim : item),
    );
  }
  async updateWeeklyReview(review: WeeklyReview): Promise<void> {
    this.snapshot.weeklyReviews = this.snapshot.weeklyReviews.map((item) =>
      item.id === review.id ? review : item,
    );
  }
  async updateWeeklyReviewRevision(
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    this.snapshot.weeklyReviewRevisions =
      this.snapshot.weeklyReviewRevisions.map((item) =>
        item.id === revision.id ? revision : item,
      );
  }
  async createOutputBlocks(blocks: OutputBlock[]): Promise<void> {
    this.snapshot.outputBlocks.push(...blocks);
  }
  async createOutputBlocksWithRevision(
    blocks: OutputBlock[],
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    this.snapshot.outputBlocks.push(...blocks);
    await this.updateWeeklyReviewRevision(revision);
  }
  async createWeeklyRevisionWithBlocks(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
    blocks: OutputBlock[],
  ): Promise<void> {
    this.snapshot.weeklyReviews = this.snapshot.weeklyReviews.map((item) =>
      item.id === review.id ? review : item,
    );
    this.snapshot.weeklyReviewRevisions.push(revision);
    this.snapshot.outputBlocks.push(...blocks);
  }
  async finalizeWeeklyReview(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    await this.updateWeeklyReview(review);
    this.snapshot.weeklyReviewRevisions.push(revision);
  }
  async updateOutputBlock(block: OutputBlock): Promise<void> {
    this.snapshot.outputBlocks = this.snapshot.outputBlocks.map((item) =>
      item.id === block.id ? block : item,
    );
  }
  async createAiRun(aiRun: AiRun): Promise<void> {
    this.snapshot.aiRuns.push(aiRun);
  }
  async updateAiRun(aiRun: AiRun): Promise<void> {
    this.snapshot.aiRuns = this.snapshot.aiRuns.map((item) =>
      item.id === aiRun.id ? aiRun : item,
    );
  }
  async createAiRunWithEvidence(
    aiRun: AiRun,
    evidence: EvidenceItem[],
    citations: Citation[],
  ): Promise<void> {
    this.snapshot.aiRuns.push(aiRun);
    this.snapshot.evidenceItems.push(...evidence);
    this.snapshot.citations.push(...citations);
  }
  async createAiRunWithWeeklyBlocks(
    aiRun: AiRun,
    blocks: OutputBlock[],
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    this.snapshot.aiRuns.push(aiRun);
    this.snapshot.outputBlocks.push(...blocks);
    await this.updateWeeklyReviewRevision(revision);
  }
  async createAiRunWithCaseBlocks(
    aiRun: AiRun,
    blocks: OutputBlock[],
    revision: CaseStudyRevision,
  ): Promise<void> {
    this.snapshot.aiRuns.push(aiRun);
    this.snapshot.outputBlocks.push(...blocks);
    this.snapshot.caseStudyRevisions.push(revision);
  }
}

describe("WorkbenchService", () => {
  let repository: MemoryWorkbenchRepository;
  let service: WorkbenchService;
  let sequence: number;

  beforeEach(() => {
    repository = new MemoryWorkbenchRepository();
    sequence = 0;
    service = new WorkbenchService(repository, {
      createId: () => `id-${++sequence}`,
      now: () => "2026-08-03T04:00:00.000Z",
    });
  });

  it("creates a source record with an immutable first revision", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "  和三位用户复查了首次进入流程。  ",
    });

    expect(record.originalText).toBe("和三位用户复查了首次进入流程。");
    expect(repository.snapshot.records).toHaveLength(1);
    expect(repository.snapshot.revisions).toMatchObject([
      {
        recordId: record.id,
        revisionNumber: 1,
        text: "和三位用户复查了首次进入流程。",
      },
    ]);
  });

  it("preserves the original text when adding a revision", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "第一次记录。",
      structuredInput: { problem: "缺少上下文" },
    });
    await service.reviseRecord(
      record.id,
      "补充了反馈发生的场景。",
      "增加上下文",
    );

    const stored = repository.snapshot.records[0]!;
    expect(stored.originalText).toBe("第一次记录。");
    expect(repository.snapshot.revisions).toHaveLength(2);
    expect(repository.snapshot.revisions[1]).toMatchObject({
      revisionNumber: 2,
      changeNote: "增加上下文",
      structuredInput: { problem: "缺少上下文" },
    });
    expect(stored.currentRevisionId).toBe(repository.snapshot.revisions[1]!.id);
  });

  it("confirms user-authored factual evidence only with a source citation", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "完成了两轮可用性测试。",
    });
    const evidence = await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "完成了两轮可用性测试。",
      type: "action",
      epistemicKind: "observed_fact",
    });

    expect(evidence).toMatchObject({
      reviewState: "confirmed",
      confirmedByUser: true,
    });
    expect(repository.snapshot.citations).toHaveLength(1);
    expect(repository.snapshot.citations[0]).toMatchObject({
      recordId: record.id,
      quoteSnapshot: "完成了两轮可用性测试。",
      validity: "valid",
    });
  });

  it("turns explicitly entered details into proposed evidence before confirmation", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "记录了今天的测试。",
      structuredInput: { action: "访谈三位用户", problem: "入口说明太长" },
    });
    const proposals = await service.createStructuredCandidates(record.id);

    expect(proposals).toHaveLength(2);
    expect(
      proposals.every(
        (item) => item.reviewState === "proposed" && !item.confirmedByUser,
      ),
    ).toBe(true);
    await service.confirmEvidence(proposals[0]!.id);
    await service.rejectEvidence(proposals[1]!.id);
    expect(
      repository.snapshot.evidenceItems.map((item) => item.reviewState),
    ).toEqual(["confirmed", "rejected"]);
    await service.restoreEvidence(proposals[1]!.id);
    expect(repository.snapshot.evidenceItems[1]?.reviewState).toBe("draft");
  });

  it("archives a record without removing its evidence history", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "保留这条记录的历史。",
    });
    const evidence = await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "保留这条记录的历史。",
      type: "action",
      epistemicKind: "observed_fact",
    });

    await service.archiveRecord(record.id);

    expect(repository.snapshot.records[0]?.lifecycle).toBe("archived");
    expect(repository.snapshot.evidenceItems).toContainEqual(evidence);
    expect(repository.snapshot.revisions).toHaveLength(1);
  });

  it("does not create duplicate candidates for the same structured field and revision", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "记录。",
      structuredInput: { currentResult: "完成第一轮" },
    });

    expect(await service.createStructuredCandidates(record.id)).toHaveLength(1);
    expect(await service.createStructuredCandidates(record.id)).toHaveLength(0);
    expect(repository.snapshot.evidenceItems).toHaveLength(1);
  });

  it("turns a raw work note into proposed, source-backed candidates", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-12",
      originalText:
        "今天一直在修改这个切片自动化工作台，遇到了很多问题。但是突然想通的是，假如一直跟 AI 聊不通，不妨先让他告诉我他分的原则是什么，我们从底层的规则开始聊。这样比一个一个修改上面不断冒出来的问题更好用一些。",
    });

    const candidates = await service.createTextCandidates(record.id);

    expect(candidates.length).toBeGreaterThanOrEqual(4);
    expect(candidates.every((item) => item.reviewState === "proposed")).toBe(
      true,
    );
    expect(candidates.every((item) => item.authoredBy === "system")).toBe(true);
    expect(
      candidates.some(
        (item) =>
          item.type === "decision" &&
          item.statement.includes("底层规则开始讨论"),
      ),
    ).toBe(true);
    expect(
      repository.snapshot.citations.every(
        (citation) =>
          citation.fieldPath === "originalText" &&
          citation.validity === "valid" &&
          citation.charRange !== undefined &&
          citation.charRange.end > citation.charRange.start &&
          citation.quoteSnapshot.length > 0,
      ),
    ).toBe(true);
    expect(await service.createTextCandidates(record.id)).toHaveLength(0);
  });

  it("keeps manual evidence available when AI is off", async () => {
    repository.snapshot.settings = {
      id: "settings-off",
      createdAt: "2026-08-03T04:00:00.000Z",
      updatedAt: "2026-08-03T04:00:00.000Z",
      schemaVersion: 1,
      displayName: "空白工作册",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      weekStartsOn: 1,
      aiMode: "off",
      demoDataLoaded: false,
    };
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "先保留这条原始记录。",
    });

    await expect(service.createAiEvidenceCandidates(record.id)).rejects.toThrow(
      "尚未启用 AI",
    );
    const evidence = await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "先保留这条原始记录。",
      type: "action",
      epistemicKind: "observed_fact",
    });
    expect(evidence.reviewState).toBe("confirmed");
    expect(repository.snapshot.aiRuns).toHaveLength(0);
  });

  it("persists deterministic demo AI proposals with an auditable run", async () => {
    repository.snapshot.settings = {
      id: "settings-demo",
      createdAt: "2026-08-03T04:00:00.000Z",
      updatedAt: "2026-08-03T04:00:00.000Z",
      schemaVersion: 1,
      displayName: "演示",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      weekStartsOn: 1,
      aiMode: "demo",
      demoDataLoaded: true,
    };
    const aiService = new WorkbenchService(
      repository,
      {
        createId: () => `ai-id-${++sequence}`,
        now: () => "2026-08-03T04:00:00.000Z",
      },
      new DemoAiAdapter(),
    );
    const record = await aiService.createRecord({
      occurredOn: "2026-08-03",
      originalText: "完成了今天的测试，也遇到了一个问题，可能需要继续验证。",
    });

    const proposals = await aiService.createAiEvidenceCandidates(record.id);

    expect(proposals.length).toBeGreaterThan(0);
    expect(
      proposals.every(
        (item) =>
          item.authoredBy === "ai" &&
          item.reviewState === "proposed" &&
          !item.confirmedByUser &&
          item.aiRunId !== undefined &&
          item.citationIds.length > 0,
      ),
    ).toBe(true);
    const hypothesis = proposals.find((item) => item.type === "hypothesis");
    expect(hypothesis?.epistemicKind).toBe("hypothesis");
    expect(hypothesis).toBeDefined();
    await aiService.confirmEvidence(hypothesis!.id);
    expect(
      repository.snapshot.evidenceItems.find(
        (item) => item.id === hypothesis!.id,
      ),
    ).toMatchObject({
      reviewState: "confirmed",
      confirmedByUser: true,
      epistemicKind: "hypothesis",
    });
    expect(repository.snapshot.aiRuns).toMatchObject([
      {
        task: "extract_evidence",
        adapter: "demo",
        status: "succeeded",
        inputRefs: expect.arrayContaining([
          expect.objectContaining({ kind: "source_record", id: record.id }),
        ]),
        outputEntityIds: expect.arrayContaining([hypothesis!.id]),
      },
    ]);
  });

  it("rejects an AI response with an unknown citation without writing evidence", async () => {
    repository.snapshot.settings = {
      id: "settings-demo",
      createdAt: "2026-08-03T04:00:00.000Z",
      updatedAt: "2026-08-03T04:00:00.000Z",
      schemaVersion: 1,
      displayName: "演示",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      weekStartsOn: 1,
      aiMode: "demo",
      demoDataLoaded: true,
    };
    const invalidAdapter: AiAdapter = {
      kind: "demo",
      extractEvidence: async (input) => [
        {
          statement: "不应被写入",
          type: "action",
          epistemicKind: "observed_fact",
          occurredOn: input.occurredOn,
          sourceCitationIds: ["missing-citation"],
        },
      ],
      draftWeeklyReview: async () => [],
      draftCaseStudy: async () => [],
      rewriteBlock: async () => ({
        sectionKey: "personal_reflection",
        content: "",
        epistemicKind: "user_judgment",
        sourceCitationIds: [],
      }),
    };
    const aiService = new WorkbenchService(
      repository,
      {
        createId: () => `ai-id-${++sequence}`,
        now: () => "2026-08-03T04:00:00.000Z",
      },
      invalidAdapter,
    );
    const record = await aiService.createRecord({
      occurredOn: "2026-08-03",
      originalText: "完成了今天的测试。",
    });

    await expect(
      aiService.createAiEvidenceCandidates(record.id),
    ).rejects.toThrow("不存在或缺失的原文引用");
    expect(repository.snapshot.evidenceItems).toHaveLength(0);
    expect(repository.snapshot.aiRuns).toMatchObject([
      { status: "failed", errorCode: "AI_RESPONSE_INVALID" },
    ]);
  });

  it("keeps raw extraction available when a record already has manual evidence", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-12",
      originalText: "完成了今天的测试，也遇到了一个问题。",
    });

    await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "完成了今天的测试。",
      type: "action",
      epistemicKind: "observed_fact",
    });

    const candidates = await service.createTextCandidates(record.id);

    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.every((item) => item.reviewState === "proposed")).toBe(
      true,
    );
  });

  it("creates a weekly draft from confirmed evidence and avoids duplicate assembly", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "完成了今天的测试。",
    });
    await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "完成了今天的测试。",
      type: "result",
      epistemicKind: "observed_fact",
      resultStage: "interim",
    });
    const review = await service.ensureWeeklyReview("2026-08-03", "2026-08-09");
    const first = await service.assembleWeeklyCandidates(review.id);
    const second = await service.assembleWeeklyCandidates(review.id);

    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({
      sectionKey: "results",
      reviewState: "proposed",
      citationIds: [repository.snapshot.citations[0]!.id],
    });
    expect(second).toHaveLength(0);
    expect(repository.snapshot.outputBlocks).toHaveLength(1);
  });

  it("requires reviewed blocks before finalizing and preserves a prior final revision", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "完成了今天的测试。",
    });
    await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "完成了今天的测试。",
      type: "result",
      epistemicKind: "observed_fact",
      resultStage: "interim",
    });

    const review = await service.ensureWeeklyReview("2026-08-03", "2026-08-09");
    await service.assembleWeeklyCandidates(review.id);
    await expect(service.finalizeWeeklyReview(review.id)).rejects.toThrow(
      "仍有内容尚未由用户确认",
    );

    const proposedBlock = repository.snapshot.outputBlocks[0]!;
    await service.confirmWeeklyBlock(proposedBlock.id);
    const finalized = await service.finalizeWeeklyReview(review.id);
    const finalizedRevision = repository.snapshot.weeklyReviewRevisions.find(
      (item) => item.id === finalized.currentRevisionId,
    )!;

    expect(finalized.status).toBe("finalized");
    expect(finalizedRevision.statusSnapshot).toBe("finalized");
    expect(finalizedRevision.blockIds).toEqual([proposedBlock.id]);
    expect(repository.snapshot.outputBlocks).toHaveLength(1);

    const draft = await service.startWeeklyRevision(review.id);
    const draftRevision = repository.snapshot.weeklyReviewRevisions.find(
      (item) => item.id === draft.currentRevisionId,
    )!;
    const clonedBlock = repository.snapshot.outputBlocks.find(
      (item) => item.id === draftRevision.blockIds[0],
    )!;

    expect(draft.status).toBe("draft");
    expect(draftRevision.revisionNumber).toBe(
      finalizedRevision.revisionNumber + 1,
    );
    expect(clonedBlock.id).not.toBe(proposedBlock.id);
    await service.updateWeeklyBlock(
      clonedBlock.id,
      "把入口测试整理成一段可复查记录。",
      "user_judgment",
    );
    expect(
      repository.snapshot.outputBlocks.find(
        (item) => item.id === proposedBlock.id,
      )?.content,
    ).toBe(proposedBlock.content);
  });

  it("does not confirm a factual weekly block without a valid citation", async () => {
    const review = await service.ensureWeeklyReview("2026-08-03", "2026-08-09");
    const block = await service.createWeeklyBlock({
      reviewId: review.id,
      sectionKey: "results",
      content: "这里没有来源的结果。",
      epistemicKind: "observed_fact",
    });

    await expect(service.confirmWeeklyBlock(block.id)).rejects.toThrow(
      "事实性输出必须保留有效来源",
    );
  });

  it("requires a weekly validation block to cite a confirmed hypothesis", async () => {
    const record = await service.createRecord({
      occurredOn: "2026-08-03",
      originalText: "如果先留下原话，用户可能更愿意开始记录。",
    });
    const hypothesis = await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "先留下原话可能降低开始记录的阻力。",
      type: "hypothesis",
      epistemicKind: "hypothesis",
    });
    const review = await service.ensureWeeklyReview("2026-08-03", "2026-08-09");
    const citationId = hypothesis.citationIds[0]!;
    const block = await service.createWeeklyBlock({
      reviewId: review.id,
      sectionKey: "next_validations",
      content: "比较单字段和五字段版本的首次完成率。",
      epistemicKind: "hypothesis",
      citationIds: [citationId],
    });

    await expect(service.confirmWeeklyBlock(block.id)).resolves.toMatchObject({
      reviewState: "confirmed",
    });
    await expect(
      service.createWeeklyBlock({
        reviewId: review.id,
        sectionKey: "next_validations",
        content: "没有假设来源的验证项。",
        epistemicKind: "hypothesis",
      }),
    ).rejects.toThrow("关联一条已确认的假设");
  });

  it("drafts weekly AI blocks as proposed, rejects them without blocking finalization", async () => {
    repository.snapshot.settings = {
      id: "settings-demo",
      createdAt: "2026-08-03T04:00:00.000Z",
      updatedAt: "2026-08-03T04:00:00.000Z",
      schemaVersion: 1,
      displayName: "演示",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      weekStartsOn: 1,
      aiMode: "demo",
      demoDataLoaded: true,
    };
    const aiService = new WorkbenchService(
      repository,
      {
        createId: () => `weekly-ai-${++sequence}`,
        now: () => "2026-08-03T04:00:00.000Z",
      },
      new DemoAiAdapter(),
    );
    const record = await aiService.createRecord({
      occurredOn: "2026-08-03",
      originalText: "完成了今天的测试。",
    });
    await aiService.createConfirmedEvidence({
      recordId: record.id,
      statement: "完成了今天的测试。",
      type: "result",
      epistemicKind: "observed_fact",
      resultStage: "interim",
    });
    const review = await aiService.ensureWeeklyReview(
      "2026-08-03",
      "2026-08-09",
    );

    const blocks = await aiService.draftAiWeeklyCandidates(review.id);

    expect(blocks).toHaveLength(2);
    const resultBlock = blocks.find((block) => block.sectionKey === "results");
    const reflectionBlock = blocks.find(
      (block) => block.sectionKey === "personal_reflection",
    );
    expect(resultBlock).toMatchObject({
      authoredBy: "ai",
      reviewState: "proposed",
      sectionKey: "results",
      authorshipNote: "ai_drafted",
    });
    expect(reflectionBlock).toMatchObject({
      authoredBy: "ai",
      reviewState: "proposed",
      epistemicKind: "user_judgment",
    });
    await expect(
      aiService.confirmWeeklyBlock(reflectionBlock!.id),
    ).rejects.toThrow("先编辑成你自己的思考");
    await aiService.rejectWeeklyBlock(resultBlock!.id);
    await aiService.updateWeeklyBlock(
      reflectionBlock!.id,
      "我会继续验证这个判断是否能减少反复沟通。",
      "user_judgment",
    );
    expect(
      repository.snapshot.outputBlocks.find(
        (block) => block.id === reflectionBlock!.id,
      ),
    ).toMatchObject({
      authoredBy: "user",
      authorshipNote: "ai_drafted_user_edited",
      reviewState: "draft",
    });
    await aiService.confirmWeeklyBlock(reflectionBlock!.id);
    await expect(
      aiService.finalizeWeeklyReview(review.id),
    ).resolves.toMatchObject({
      status: "finalized",
    });
    expect(repository.snapshot.aiRuns).toContainEqual(
      expect.objectContaining({
        task: "draft_weekly_review",
        status: "succeeded",
      }),
    );
  });

  it("drafts case study AI blocks from included evidence without auto-confirming capability", async () => {
    repository.snapshot.settings = {
      id: "settings-demo",
      createdAt: "2026-08-03T04:00:00.000Z",
      updatedAt: "2026-08-03T04:00:00.000Z",
      schemaVersion: 1,
      displayName: "演示",
      locale: "zh-CN",
      timezone: "Asia/Shanghai",
      weekStartsOn: 1,
      aiMode: "demo",
      demoDataLoaded: true,
    };
    const aiService = new WorkbenchService(
      repository,
      {
        createId: () => `case-ai-${++sequence}`,
        now: () => "2026-08-03T04:00:00.000Z",
      },
      new DemoAiAdapter(),
    );
    const project = await aiService.createProject({ name: "演示项目" });
    const record = await aiService.createRecord({
      occurredOn: "2026-08-03",
      originalText: "完成了验证并根据反馈调整方案。",
      projectId: project.id,
    });
    const action = await aiService.createConfirmedEvidence({
      recordId: record.id,
      statement: "完成了验证。",
      type: "action",
      epistemicKind: "observed_fact",
    });
    const result = await aiService.createConfirmedEvidence({
      recordId: record.id,
      statement: "根据反馈调整方案。",
      type: "feedback",
      epistemicKind: "observed_fact",
    });
    const caseStudy = await aiService.createCaseStudy({
      projectId: project.id,
      title: "演示案例",
      rangeStart: "2026-08-01",
      rangeEnd: "2026-08-09",
      includedEvidenceIds: [action.id, result.id],
    });

    const blocks = await aiService.draftAiCaseStudyCandidates(caseStudy.id);

    expect(blocks.length).toBeGreaterThan(0);
    expect(blocks.every((block) => block.authoredBy === "ai")).toBe(true);
    expect(blocks.every((block) => block.reviewState === "proposed")).toBe(
      true,
    );
    expect(repository.snapshot.aiRuns).toContainEqual(
      expect.objectContaining({
        task: "draft_case_study",
        status: "succeeded",
      }),
    );
  });

  it("builds a seven-part case study from confirmed project evidence", async () => {
    const project = await service.createProject({
      name: "信息流生产管理 MVP",
      description: "把零散生产过程整理成可复查的工作台。",
    });
    const record = await service.createRecord({
      occurredOn: "2026-08-12",
      originalText: "完成了信息流生产管理 MVP 的第一轮验证。",
      projectId: project.id,
    });
    const evidence = await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "完成了第一轮验证。",
      type: "result",
      epistemicKind: "observed_fact",
      resultStage: "interim",
    });
    const behaviorEvidence = await service.createConfirmedEvidence({
      recordId: record.id,
      statement: "完成了第一轮验证流程。",
      type: "action",
      epistemicKind: "observed_fact",
    });
    const caseStudy = await service.createCaseStudy({
      projectId: project.id,
      title: "把生产过程整理成可复查的工作台",
      rangeStart: "2026-08-01",
      rangeEnd: "2026-08-31",
      includedEvidenceIds: [evidence.id, behaviorEvidence.id],
    });
    const initialRevision = repository.snapshot.caseStudyRevisions.find(
      (revision) => revision.id === caseStudy.currentRevisionId,
    )!;
    const initialBlocks = initialRevision.blockIds.map((id) =>
      repository.snapshot.outputBlocks.find((block) => block.id === id)!,
    );

    expect(initialBlocks).toHaveLength(7);
    await expect(service.finalizeCaseStudy(caseStudy.id)).rejects.toThrow(
      "项目案例的七个部分都需要先写下内容",
    );

    for (const block of initialBlocks) {
      const isResult = block.sectionKey === "result";
      const isCapability = block.sectionKey === "capability";
      await service.updateCaseStudyBlock(
        block.id,
        `${block.sectionKey}：这是由我写下的一段具体内容。`,
        isResult ? "observed_fact" : "user_judgment",
        isResult ? evidence.citationIds : [],
      );
      if (isCapability) {
        await expect(service.confirmCaseStudyBlock(block.id)).rejects.toThrow(
          "行为或判断证据",
        );
        await service.updateCaseStudyBlock(
          block.id,
          `${block.sectionKey}：这是由我写下的一段具体内容。`,
          "user_judgment",
          behaviorEvidence.citationIds,
        );
      }
      await service.confirmCaseStudyBlock(block.id);
    }

    const finalized = await service.finalizeCaseStudy(caseStudy.id);
    expect(finalized.status).toBe("finalized");
    expect(repository.snapshot.caseStudyRevisions).toHaveLength(2);

    const clue = await service.createCapabilityClaim({
      caseStudyId: caseStudy.id,
      title: "整理复杂生产过程",
      statement: "在这段项目中，能够把零散工作整理成可复查的流程。",
      context: "项目早期信息分散，验证过程需要保留判断和结果。",
      behaviorEvidenceIds: [behaviorEvidence.id],
      outcomeEvidenceIds: [],
      feedbackEvidenceIds: [],
    });
    expect(clue.reviewState).toBe("draft");
    await expect(service.confirmCapabilityClaim(clue.id)).rejects.toThrow(
      "能力主张需要情境、行为、结果或反馈",
    );

    const claim = await service.createCapabilityClaim({
      caseStudyId: caseStudy.id,
      title: "把生产过程整理成可复查的工作台",
      statement: "在这段项目中，能够把零散工作整理成可复查的流程。",
      context: "项目早期信息分散，验证过程需要保留判断和结果。",
      behaviorEvidenceIds: [behaviorEvidence.id],
      outcomeEvidenceIds: [evidence.id],
      feedbackEvidenceIds: [],
    });
    expect(claim.reviewState).toBe("draft");
    const confirmedClaim = await service.confirmCapabilityClaim(claim.id);
    expect(confirmedClaim.reviewState).toBe("confirmed");
    await expect(
      service.createCapabilityClaim({
        caseStudyId: caseStudy.id,
        title: "过度承诺",
        statement: "长期稳定地解决所有项目问题。",
        context: "一个具体项目。",
        behaviorEvidenceIds: [behaviorEvidence.id],
        outcomeEvidenceIds: [evidence.id],
        feedbackEvidenceIds: [],
      }),
    ).rejects.toThrow("单项目能力主张");

    const draft = await service.startCaseStudyRevision(caseStudy.id);
    const draftRevision = repository.snapshot.caseStudyRevisions.find(
      (revision) => revision.id === draft.currentRevisionId,
    )!;
    expect(draft.status).toBe("draft");
    expect(draftRevision.revisionNumber).toBe(3);
    expect(
      draftRevision.blockIds.every(
        (id) =>
          repository.snapshot.outputBlocks.find((block) => block.id === id)
            ?.reviewState === "draft",
      ),
    ).toBe(true);
  });

  it("reframes legacy sentence candidates and preserves merged history", async () => {
    const text =
      "今天一直在修改这个切片自动化工作台，遇到了很多问题。但是突然想通的是，假如一直跟 AI 聊不通，不妨先让他告诉我他分的原则是什么，我们从底层的规则开始聊。这样比一个一个修改上面不断冒出来的问题更好用一些。";
    const record = await service.createRecord({
      occurredOn: "2026-08-13",
      originalText: text,
    });
    const revision = repository.snapshot.revisions.find(
      (item) => item.id === record.currentRevisionId,
    )!;
    const oldQuotes = [
      "不妨先让他告诉我他分的原则是什么",
      "我们从底层的规则开始聊",
    ];
    oldQuotes.forEach((quote, index) => {
      const citation: Citation = {
        id: `legacy-citation-${index}`,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        schemaVersion: 1,
        targetKind: "source_record_revision",
        targetId: revision.id,
        recordId: record.id,
        quoteSnapshot: quote,
        fieldPath: "originalText",
        validity: "valid",
      };
      repository.snapshot.citations.push(citation);
      repository.snapshot.evidenceItems.push({
        id: `legacy-evidence-${index}`,
        createdAt: "2026-08-13T00:00:00.000Z",
        updatedAt: "2026-08-13T00:00:00.000Z",
        schemaVersion: 1,
        occurredOn: record.occurredOn,
        type: "decision",
        statement: quote,
        epistemicKind: "user_judgment",
        reviewState: index === 0 ? "confirmed" : "proposed",
        authoredBy: "system",
        confirmedByUser: index === 0,
        ...(index === 0 ? { confirmedAt: "2026-08-13T00:00:00.000Z" } : {}),
        citationIds: [citation.id],
      });
    });

    const changed = await service.reframeTextCandidates(record.id);
    const decisions = repository.snapshot.evidenceItems.filter(
      (item) => item.type === "decision",
    );

    expect(changed).toBeGreaterThanOrEqual(2);
    expect(
      decisions.some(
        (item) =>
          item.reviewState === "confirmed" &&
          item.statement === "先让 AI 说明分类原则，并从底层规则开始讨论",
      ),
    ).toBe(true);
    expect(
      decisions.some(
        (item) =>
          item.reviewState === "rejected" &&
          item.rejectionReason?.includes("合并"),
      ),
    ).toBe(true);
  });
});
