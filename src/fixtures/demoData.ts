import type {
  AiRun,
  CapabilityClaim,
  CaseStudy,
  CaseStudyRevision,
  Citation,
  EntityMeta,
  EvidenceItem,
  ImportBatch,
  OutputBlock,
  Project,
  RecordRevision,
  SourceRecord,
  TraceData,
  ValidationPlan,
  WeeklyReview,
  WeeklyReviewRevision,
  WorkspaceSettings,
} from "../domain/model";

const CREATED_AT = "2026-07-20T01:00:00.000Z";
const UPDATED_AT = "2026-08-02T10:00:00.000Z";

function meta(id: string, updatedAt = UPDATED_AT): EntityMeta {
  return { id, createdAt: CREATED_AT, updatedAt, schemaVersion: 1 };
}

export const demoWorkspace: WorkspaceSettings = {
  ...meta("workspace-demo"),
  displayName: "我的工作证据册",
  locale: "zh-CN",
  timezone: "Asia/Shanghai",
  weekStartsOn: 1,
  aiMode: "demo",
  demoDataLoaded: true,
};

export const demoProjects: Project[] = [
  {
    ...meta("project-interview"),
    name: "用户访谈内容改版",
    description:
      "重新组织一组人物访谈内容的叙事结构，并验证读者是否更容易理解人物选择。",
    status: "completed",
    startedOn: "2026-07-07",
    endedOn: "2026-07-24",
    colorToken: "clay",
  },
  {
    ...meta("project-onboarding"),
    name: "新用户首次使用体验优化",
    description: "降低首次进入产品时的理解和操作负担。",
    status: "active",
    startedOn: "2026-07-27",
    colorToken: "moss",
  },
  {
    ...meta("project-research"),
    name: "内容效果归因研究：从表面数据回到真实观看动机",
    status: "paused",
    startedOn: "2026-06-15",
    colorToken: "slate",
  },
];

interface RecordSeed {
  id: string;
  occurredOn: string;
  projectId?: string;
  text: string;
  type: EvidenceItem["type"];
  statement: string;
  epistemicKind: EvidenceItem["epistemicKind"];
  reviewState: EvidenceItem["reviewState"];
  authoredBy: EvidenceItem["authoredBy"];
  resultStage?: EvidenceItem["resultStage"];
  rejectionReason?: string;
}

const recordSeeds: RecordSeed[] = [
  {
    id: "record-01",
    occurredOn: "2026-07-20",
    projectId: "project-interview",
    text: "把 6 段访谈逐句标出时间线和冲突点，发现开头连续三分钟都在交代履历，没有出现真正的选择。",
    type: "action",
    statement: "逐句标注 6 段访谈的时间线和冲突点。",
    epistemicKind: "observed_fact",
    reviewState: "confirmed",
    authoredBy: "user",
  },
  {
    id: "record-02",
    occurredOn: "2026-07-21",
    projectId: "project-interview",
    text: "问题不在素材不够，而是履历信息占据开头，人物真正困难的选择出现得太晚。",
    type: "problem",
    statement: "访谈开头的信息顺序让人物的关键选择出现过晚。",
    epistemicKind: "user_judgment",
    reviewState: "confirmed",
    authoredBy: "user",
  },
  {
    id: "record-03",
    occurredOn: "2026-07-21",
    projectId: "project-interview",
    text: "决定不再按采访顺序剪，先用‘放弃稳定工作’的选择建立悬念，再回到人物背景。",
    type: "decision",
    statement: "决定以关键选择而非采访时间顺序组织开头。",
    epistemicKind: "user_judgment",
    reviewState: "confirmed",
    authoredBy: "user",
  },
  {
    id: "record-04",
    occurredOn: "2026-07-23",
    projectId: "project-interview",
    text: "新版小样的前 30 秒完成观看率从内部基线 41% 提升到 56%，样本为同一批 50 名测试用户。",
    type: "result",
    statement: "同批 50 名测试用户中，前 30 秒完成观看率由 41% 提升到 56%。",
    epistemicKind: "observed_fact",
    reviewState: "confirmed",
    authoredBy: "user",
    resultStage: "final",
  },
  {
    id: "record-05",
    occurredOn: "2026-07-24",
    projectId: "project-interview",
    text: "编辑复盘时反馈：新版开头让她更快理解人物为什么值得继续看，但第二段的背景仍然偏长。",
    type: "feedback",
    statement: "编辑认为新版更快建立观看理由，同时指出第二段背景仍偏长。",
    epistemicKind: "observed_fact",
    reviewState: "confirmed",
    authoredBy: "user",
  },
  {
    id: "record-06",
    occurredOn: "2026-07-28",
    projectId: "project-onboarding",
    text: "第一次测试里，用户看到五个必填字段后停了下来。后来他说不是不知道答案，而是不想在刚进入时做完整复盘。",
    type: "learning",
    statement:
      "首次记录应先允许留下原话，再逐步补充结构，而不是要求一次完成复盘。",
    epistemicKind: "user_judgment",
    reviewState: "confirmed",
    authoredBy: "user",
  },
  {
    id: "record-07",
    occurredOn: "2026-07-30",
    projectId: "project-onboarding",
    text: "如果把原始文字设为唯一必填项，首次记录完成率可能提高。下轮测试比较单字段和五字段版本。",
    type: "hypothesis",
    statement: "只保留原始文字为必填项，可能提高首次记录完成率。",
    epistemicKind: "hypothesis",
    reviewState: "confirmed",
    authoredBy: "user",
  },
  {
    id: "record-08",
    occurredOn: "2026-08-01",
    text: "临时帮同事把会议材料重新排了一遍顺序，目前没有记录为什么改，也没有后续反馈。",
    type: "action",
    statement: "重新排列会议材料说明了稳定的复杂信息组织能力。",
    epistemicKind: "ai_inference",
    reviewState: "rejected",
    authoredBy: "ai",
    rejectionReason:
      "只有一次普通行动，没有判断、结果或反馈，不能形成能力结论。",
  },
];

export const demoSourceRecords: SourceRecord[] = recordSeeds.map((seed) => ({
  ...meta(seed.id),
  occurredOn: seed.occurredOn,
  ...(seed.projectId === undefined ? {} : { projectId: seed.projectId }),
  originalText: seed.text,
  currentRevisionId: `${seed.id}-revision-1`,
  sourceLabel: "工作手记",
  lifecycle: "active",
}));

export const demoRecordRevisions: RecordRevision[] = recordSeeds.map(
  (seed) => ({
    ...meta(`${seed.id}-revision-1`),
    recordId: seed.id,
    revisionNumber: 1,
    text: seed.text,
    author: "user",
  }),
);

export const demoImportBatches: ImportBatch[] = [
  {
    ...meta("import-batch-demo-feishu"),
    provider: "feishu",
    transport: "local_companion",
    scopeSummary:
      "演示：已选择一个虚构文档，时间范围为 2026-07-20 至 2026-07-24",
    selectedCount: 1,
    importedCount: 1,
    status: "confirmed",
  },
];

demoRecordRevisions.push({
  ...meta("record-05-revision-2"),
  recordId: "record-05",
  revisionNumber: 2,
  text: `${recordSeeds[4]?.text ?? ""} 补充：该反馈记录于 7 月 24 日项目复盘会。`,
  changeNote: "补充反馈发生的场景。",
  author: "user",
});

demoSourceRecords[4] = {
  ...demoSourceRecords[4]!,
  currentRevisionId: "record-05-revision-2",
  sourceAttribution: {
    origin: "feishu_document",
    providerLabel: "飞书",
    externalId: "demo-feishu-record-05",
    importedAt: UPDATED_AT,
    importBatchId: "import-batch-demo-feishu",
  },
};

export const demoCitations: Citation[] = recordSeeds.map((seed) => ({
  ...meta(`${seed.id}-citation-1`),
  targetKind: "source_record_revision",
  targetId: `${seed.id}-revision-1`,
  recordId: seed.id,
  quoteSnapshot: seed.text,
  validity: "valid",
}));

export const demoEvidenceItems: EvidenceItem[] = recordSeeds.map((seed) => ({
  ...meta(`${seed.id}-evidence-1`),
  occurredOn: seed.occurredOn,
  ...(seed.projectId === undefined ? {} : { projectId: seed.projectId }),
  type: seed.type,
  statement: seed.statement,
  epistemicKind: seed.epistemicKind,
  reviewState: seed.reviewState,
  ...(seed.resultStage === undefined ? {} : { resultStage: seed.resultStage }),
  authoredBy: seed.authoredBy,
  ...(seed.authoredBy === "ai" ? { aiRunId: "ai-run-demo-01" } : {}),
  ...(seed.reviewState === "confirmed" ? { confirmedAt: UPDATED_AT } : {}),
  confirmedByUser: seed.reviewState === "confirmed",
  ...(seed.rejectionReason === undefined
    ? {}
    : { rejectionReason: seed.rejectionReason }),
  citationIds: [`${seed.id}-citation-1`],
}));

const finalReview: WeeklyReview = {
  ...meta("weekly-review-2026-07-20"),
  weekStart: "2026-07-20",
  weekEnd: "2026-07-26",
  timezone: "Asia/Shanghai",
  status: "finalized",
  currentRevisionId: "weekly-review-2026-07-20-revision-1",
  finalizedAt: UPDATED_AT,
};

const draftReview: WeeklyReview = {
  ...meta("weekly-review-2026-07-27"),
  weekStart: "2026-07-27",
  weekEnd: "2026-08-02",
  timezone: "Asia/Shanghai",
  status: "draft",
  currentRevisionId: "weekly-review-2026-07-27-revision-1",
};

export const demoWeeklyReviews = [finalReview, draftReview];

const weeklyBlockSeeds: Array<{
  id: string;
  sectionKey: OutputBlock["sectionKey"];
  content: string;
  evidenceIndex: number;
  epistemicKind: OutputBlock["epistemicKind"];
}> = [
  {
    id: "focus",
    sectionKey: "focus",
    content: "重组用户访谈开头的叙事顺序。",
    evidenceIndex: 2,
    epistemicKind: "user_judgment",
  },
  {
    id: "results",
    sectionKey: "results",
    content: "测试样本的前 30 秒完成观看率由 41% 提升到 56%。",
    evidenceIndex: 3,
    epistemicKind: "observed_fact",
  },
  {
    id: "went-well",
    sectionKey: "went_well",
    content: "先定位信息顺序问题，再决定剪辑结构，避免了无目的压缩素材。",
    evidenceIndex: 1,
    epistemicKind: "user_judgment",
  },
  {
    id: "problems",
    sectionKey: "problems",
    content: "第二段背景信息仍然偏长。",
    evidenceIndex: 4,
    epistemicKind: "observed_fact",
  },
  {
    id: "supported",
    sectionKey: "supported_causes",
    content: "原开头连续交代履历，关键选择出现过晚。",
    evidenceIndex: 0,
    epistemicKind: "observed_fact",
  },
  {
    id: "inferred",
    sectionKey: "inferred_causes",
    content: "观众可能需要先理解人物付出的代价，才愿意继续了解背景。",
    evidenceIndex: 2,
    epistemicKind: "ai_inference",
  },
  {
    id: "validations",
    sectionKey: "next_validations",
    content: "下一版继续缩短第二段背景，并观察 60 秒留存变化。",
    evidenceIndex: 6,
    epistemicKind: "hypothesis",
  },
  {
    id: "reflection",
    sectionKey: "personal_reflection",
    content: "这次有效的不是剪得更快，而是先回答观众为什么要继续看。",
    evidenceIndex: 2,
    epistemicKind: "user_judgment",
  },
];

export const demoOutputBlocks: OutputBlock[] = weeklyBlockSeeds.map(
  (seed, index) => ({
    ...meta(`weekly-block-${seed.id}`),
    ownerKind: "weekly_review_revision",
    ownerId: "weekly-review-2026-07-20-revision-1",
    sectionKey: seed.sectionKey,
    order: index,
    content: seed.content,
    epistemicKind: seed.epistemicKind,
    reviewState: "confirmed",
    authoredBy: "user",
    authorshipNote: "user_written",
    citationIds: [demoCitations[seed.evidenceIndex]!.id],
  }),
);

demoOutputBlocks.push({
  ...meta("weekly-block-draft-hypothesis"),
  ownerKind: "weekly_review_revision",
  ownerId: "weekly-review-2026-07-27-revision-1",
  sectionKey: "next_validations",
  order: 0,
  content: "测试单字段记录是否比五字段表单更容易完成。",
  epistemicKind: "hypothesis",
  reviewState: "proposed",
  authoredBy: "ai",
  authorshipNote: "ai_drafted",
  citationIds: [demoCitations[6]!.id],
  aiRunId: "ai-run-demo-01",
});

export const demoWeeklyReviewRevisions: WeeklyReviewRevision[] = [
  {
    ...meta("weekly-review-2026-07-20-revision-1"),
    weeklyReviewId: finalReview.id,
    revisionNumber: 1,
    statusSnapshot: "finalized",
    blockIds: demoOutputBlocks.slice(0, 8).map((block) => block.id),
    createdBy: "user",
  },
  {
    ...meta("weekly-review-2026-07-27-revision-1"),
    weeklyReviewId: draftReview.id,
    revisionNumber: 1,
    statusSnapshot: "draft",
    blockIds: ["weekly-block-draft-hypothesis"],
    createdBy: "system",
  },
];

export const demoCaseStudy: CaseStudy = {
  ...meta("case-study-interview"),
  projectId: "project-interview",
  title: "让人物的关键选择更早发生",
  rangeStart: "2026-07-20",
  rangeEnd: "2026-07-24",
  includedEvidenceIds: demoEvidenceItems.slice(0, 5).map((item) => item.id),
  excludedEvidenceIds: [],
  status: "finalized",
  currentRevisionId: "case-study-interview-revision-1",
  finalizedAt: UPDATED_AT,
};

const caseBlockSeeds: Array<{
  sectionKey: OutputBlock["sectionKey"];
  content: string;
  evidenceIndex: number;
  epistemicKind: OutputBlock["epistemicKind"];
}> = [
  {
    sectionKey: "background",
    content:
      "一组人物访谈素材信息完整，但测试用户难以在开头建立继续观看的理由。",
    evidenceIndex: 0,
    epistemicKind: "user_judgment",
  },
  {
    sectionKey: "problem",
    content: "关键选择出现过晚，履历信息占据了开头。",
    evidenceIndex: 1,
    epistemicKind: "user_judgment",
  },
  {
    sectionKey: "judgment",
    content: "问题是信息顺序，而不是素材数量。",
    evidenceIndex: 1,
    epistemicKind: "user_judgment",
  },
  {
    sectionKey: "action",
    content: "先呈现放弃稳定工作的选择，再回到人物背景。",
    evidenceIndex: 2,
    epistemicKind: "user_judgment",
  },
  {
    sectionKey: "iteration",
    content: "根据编辑反馈保留新版开头，同时继续压缩第二段背景。",
    evidenceIndex: 4,
    epistemicKind: "user_judgment",
  },
  {
    sectionKey: "result",
    content: "前 30 秒完成观看率在同批测试中由 41% 提升到 56%。",
    evidenceIndex: 3,
    epistemicKind: "observed_fact",
  },
  {
    sectionKey: "capability",
    content:
      "在内容信息完整但观看动机不清楚的情境中，能从信息顺序定位问题并设计可验证的叙事调整。",
    evidenceIndex: 3,
    epistemicKind: "user_judgment",
  },
];

const caseBlocks = caseBlockSeeds.map((seed, index): OutputBlock => ({
  ...meta(`case-block-${index + 1}`),
  ownerKind: "case_study_revision",
  ownerId: "case-study-interview-revision-1",
  sectionKey: seed.sectionKey,
  order: index,
  content: seed.content,
  epistemicKind: seed.epistemicKind,
  reviewState: "confirmed",
  authoredBy: "user",
  authorshipNote: "user_written",
  citationIds: [demoCitations[seed.evidenceIndex]!.id],
  ...(seed.sectionKey === "capability"
    ? { capabilityClaimId: "capability-claim-01" }
    : {}),
}));

demoOutputBlocks.push(...caseBlocks);

export const demoCaseStudyRevision: CaseStudyRevision = {
  ...meta("case-study-interview-revision-1"),
  caseStudyId: demoCaseStudy.id,
  revisionNumber: 1,
  blockIds: caseBlocks.map((block) => block.id),
  createdBy: "user",
};

export const demoCapabilityClaim: CapabilityClaim = {
  ...meta("capability-claim-01"),
  title: "从观看动机反推内容结构",
  statement:
    "在该访谈改版中，能够从用户观看动机定位信息顺序问题，并设计可验证的叙事调整。",
  scope: "single_project",
  reviewState: "confirmed",
  authoredBy: "user",
  context: "素材信息完整，但关键选择出现过晚；需要在不补拍的前提下改善开头。",
  behaviorEvidenceIds: [demoEvidenceItems[0]!.id, demoEvidenceItems[2]!.id],
  outcomeEvidenceIds: [demoEvidenceItems[3]!.id],
  feedbackEvidenceIds: [demoEvidenceItems[4]!.id],
  caseStudyIds: [demoCaseStudy.id],
  limitations:
    "目前只由一个访谈项目支持，不能证明在所有内容类型中都能稳定复现。",
};

export const demoValidationPlan: ValidationPlan = {
  ...meta("validation-plan-01"),
  hypothesisEvidenceId: demoEvidenceItems[6]!.id,
  question: "原始文字作为唯一必填项是否提高首次记录完成率？",
  validationAction: "使用同一任务说明分别测试单字段和五字段版本。",
  expectedSignal: "首次记录完成率提高，且补充字段率没有明显下降。",
  targetDate: "2026-08-07",
  status: "planned",
};

export const demoAiRun: AiRun = {
  ...meta("ai-run-demo-01"),
  task: "extract_evidence",
  adapter: "demo",
  modelLabel: "固定演示响应",
  promptVersion: "extract-evidence-v1",
  inputRefs: [
    {
      kind: "source_record",
      id: "record-07",
      revisionId: "record-07-revision-1",
    },
    {
      kind: "source_record",
      id: "record-08",
      revisionId: "record-08-revision-1",
    },
  ],
  status: "succeeded",
  startedAt: "2026-08-01T02:00:00.000Z",
  completedAt: "2026-08-01T02:00:00.120Z",
  outputEntityIds: [demoEvidenceItems[6]!.id, demoEvidenceItems[7]!.id],
};

export const demoData: TraceData = {
  workspaceSettings: [demoWorkspace],
  projects: demoProjects,
  sourceRecords: demoSourceRecords,
  recordRevisions: demoRecordRevisions,
  importBatches: demoImportBatches,
  evidenceItems: demoEvidenceItems,
  citations: demoCitations,
  weeklyReviews: demoWeeklyReviews,
  weeklyReviewRevisions: demoWeeklyReviewRevisions,
  caseStudies: [demoCaseStudy],
  caseStudyRevisions: [demoCaseStudyRevision],
  outputBlocks: demoOutputBlocks,
  capabilityClaims: [demoCapabilityClaim],
  validationPlans: [demoValidationPlan],
  aiRuns: [demoAiRun],
};
