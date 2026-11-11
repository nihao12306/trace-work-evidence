import { z } from "zod";
import { DomainError } from "./errors";
import type { TraceBackup } from "./model";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const isoDateTime = z.string().datetime({ offset: true });
const id = z.string().min(1);

const entityMeta = {
  id,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  schemaVersion: z.number().int().positive(),
};

const structuredFields = z
  .object({
    action: z.string().optional(),
    problem: z.string().optional(),
    currentResult: z.string().optional(),
    oneLineJudgment: z.string().optional(),
  })
  .strict();

const workspaceSettings = z
  .object({
    ...entityMeta,
    displayName: z.string(),
    locale: z.literal("zh-CN"),
    timezone: z.string().min(1),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]),
    aiMode: z.enum(["off", "demo", "custom_endpoint"]),
    aiEndpointConfig: z
      .object({ endpoint: z.string(), modelLabel: z.string().optional() })
      .strict()
      .optional(),
    careerProfile: z
      .object({
        currentRole: z.string(),
        targetDirections: z.string(),
        preferredWork: z.string(),
        constraints: z.string(),
        dealBreakers: z.string(),
        updatedAt: isoDateTime,
      })
      .strict()
      .optional(),
    demoDataLoaded: z.boolean(),
  })
  .strict();

const project = z
  .object({
    ...entityMeta,
    name: z.string().min(1),
    description: z.string().optional(),
    status: z.enum(["active", "paused", "completed", "archived"]),
    startedOn: isoDate.optional(),
    endedOn: isoDate.optional(),
    colorToken: z.enum(["clay", "moss", "slate", "ochre"]).optional(),
  })
  .strict();

const sourceRecord = z
  .object({
    ...entityMeta,
    occurredOn: isoDate,
    projectId: id.optional(),
    originalText: z.string().min(1),
    originalStructuredInput: structuredFields.optional(),
    currentRevisionId: id,
    sourceLabel: z.string().optional(),
    sourceAttribution: z
      .object({
        origin: z.enum([
          "manual",
          "file_import",
          "feishu_document",
          "codex_task",
        ]),
        providerLabel: z.string().min(1),
        externalId: z.string().optional(),
        locator: z.string().optional(),
        importedAt: isoDateTime.optional(),
        importBatchId: id.optional(),
      })
      .strict()
      .optional(),
    lifecycle: z.enum(["active", "archived", "trashed"]),
  })
  .strict();

const recordRevision = z
  .object({
    ...entityMeta,
    recordId: id,
    revisionNumber: z.number().int().positive(),
    text: z.string().min(1),
    structuredInput: structuredFields.optional(),
    changeNote: z.string().optional(),
    author: z.literal("user"),
  })
  .strict();

const importBatch = z
  .object({
    ...entityMeta,
    provider: z.enum(["local_file", "feishu", "codex"]),
    transport: z.enum(["file_picker", "local_companion"]),
    scopeSummary: z.string(),
    selectedCount: z.number().int().nonnegative(),
    importedCount: z.number().int().nonnegative(),
    status: z.enum(["preview", "confirmed", "rejected", "failed"]),
    failureMessage: z.string().optional(),
  })
  .strict();

const evidenceItem = z
  .object({
    ...entityMeta,
    projectId: id.optional(),
    occurredOn: isoDate,
    type: z.enum([
      "action",
      "problem",
      "decision",
      "result",
      "feedback",
      "learning",
      "hypothesis",
    ]),
    statement: z.string().min(1),
    epistemicKind: z.enum([
      "observed_fact",
      "user_judgment",
      "ai_inference",
      "hypothesis",
    ]),
    reviewState: z.enum(["draft", "proposed", "confirmed", "rejected"]),
    resultStage: z.enum(["interim", "final"]).optional(),
    authoredBy: z.enum(["user", "ai", "system"]),
    aiRunId: id.optional(),
    confirmedAt: isoDateTime.optional(),
    confirmedByUser: z.boolean(),
    rejectionReason: z.string().optional(),
    citationIds: z.array(id),
  })
  .strict();

const citation = z
  .object({
    ...entityMeta,
    targetKind: z.enum(["source_record_revision", "evidence_item"]),
    targetId: id,
    recordId: id.optional(),
    quoteSnapshot: z.string().min(1),
    fieldPath: z.string().optional(),
    charRange: z
      .object({ start: z.number().int(), end: z.number().int() })
      .strict()
      .optional(),
    validity: z.enum(["valid", "stale", "missing"]),
  })
  .strict();

const weeklyReview = z
  .object({
    ...entityMeta,
    weekStart: isoDate,
    weekEnd: isoDate,
    timezone: z.string(),
    status: z.enum(["draft", "in_review", "finalized"]),
    currentRevisionId: id,
    finalizedAt: isoDateTime.optional(),
  })
  .strict();

const weeklyReviewRevision = z
  .object({
    ...entityMeta,
    weeklyReviewId: id,
    revisionNumber: z.number().int().positive(),
    statusSnapshot: z.enum(["draft", "in_review", "finalized"]),
    blockIds: z.array(id),
    createdBy: z.enum(["user", "system"]),
  })
  .strict();

const outputBlock = z
  .object({
    ...entityMeta,
    ownerKind: z.enum(["weekly_review_revision", "case_study_revision"]),
    ownerId: id,
    sectionKey: z.enum([
      "focus",
      "results",
      "went_well",
      "problems",
      "supported_causes",
      "inferred_causes",
      "next_validations",
      "personal_reflection",
      "background",
      "problem",
      "judgment",
      "action",
      "iteration",
      "result",
      "capability",
    ]),
    order: z.number().int().nonnegative(),
    content: z.string(),
    epistemicKind: z.enum([
      "observed_fact",
      "user_judgment",
      "ai_inference",
      "hypothesis",
    ]),
    reviewState: z.enum(["draft", "proposed", "confirmed", "rejected"]),
    authoredBy: z.enum(["user", "ai", "system"]),
    authorshipNote: z
      .enum(["user_written", "ai_drafted", "ai_drafted_user_edited"])
      .optional(),
    rejectionReason: z.string().optional(),
    citationIds: z.array(id),
    aiRunId: id.optional(),
    capabilityClaimId: id.optional(),
  })
  .strict();

const validationPlan = z
  .object({
    ...entityMeta,
    hypothesisEvidenceId: id,
    question: z.string(),
    validationAction: z.string(),
    expectedSignal: z.string().optional(),
    targetDate: isoDate.optional(),
    status: z.enum(["planned", "observed", "closed"]),
    outcomeEvidenceId: id.optional(),
  })
  .strict();

const caseStudy = z
  .object({
    ...entityMeta,
    projectId: id,
    title: z.string(),
    rangeStart: isoDate,
    rangeEnd: isoDate,
    includedEvidenceIds: z.array(id),
    excludedEvidenceIds: z.array(id),
    status: z.enum(["draft", "in_review", "finalized"]),
    currentRevisionId: id,
    finalizedAt: isoDateTime.optional(),
  })
  .strict();

const caseStudyRevision = z
  .object({
    ...entityMeta,
    caseStudyId: id,
    revisionNumber: z.number().int().positive(),
    blockIds: z.array(id),
    createdBy: z.enum(["user", "system"]),
  })
  .strict();

const capabilityClaim = z
  .object({
    ...entityMeta,
    title: z.string(),
    statement: z.string(),
    scope: z.enum(["single_project", "cross_project"]),
    reviewState: z.enum(["draft", "proposed", "confirmed", "rejected"]),
    authoredBy: z.enum(["user", "ai", "system"]),
    aiRunId: id.optional(),
    context: z.string(),
    behaviorEvidenceIds: z.array(id),
    outcomeEvidenceIds: z.array(id),
    feedbackEvidenceIds: z.array(id),
    caseStudyIds: z.array(id),
    limitations: z.string().optional(),
  })
  .strict();

const aiRun = z
  .object({
    ...entityMeta,
    task: z.enum([
      "extract_evidence",
      "draft_weekly_review",
      "draft_case_study",
      "rewrite_block",
    ]),
    adapter: z.enum(["demo", "custom_endpoint"]),
    modelLabel: z.string(),
    promptVersion: z.string(),
    inputRefs: z.array(
      z.object({ kind: z.string(), id, revisionId: id.optional() }).strict(),
    ),
    status: z.enum(["running", "succeeded", "failed", "cancelled"]),
    startedAt: isoDateTime,
    completedAt: isoDateTime.optional(),
    errorCode: z.string().optional(),
    outputEntityIds: z.array(id),
  })
  .strict();

export const traceBackupSchema = z
  .object({
    format: z.literal("trace-backup"),
    formatVersion: z.literal(1),
    exportedAt: isoDateTime,
    appVersion: z.string(),
    checksum: z.string().optional(),
    data: z
      .object({
        workspaceSettings: z.array(workspaceSettings),
        projects: z.array(project),
        sourceRecords: z.array(sourceRecord),
        recordRevisions: z.array(recordRevision),
        importBatches: z.array(importBatch).default([]),
        evidenceItems: z.array(evidenceItem),
        citations: z.array(citation),
        weeklyReviews: z.array(weeklyReview),
        weeklyReviewRevisions: z.array(weeklyReviewRevision),
        caseStudies: z.array(caseStudy),
        caseStudyRevisions: z.array(caseStudyRevision),
        outputBlocks: z.array(outputBlock),
        capabilityClaims: z.array(capabilityClaim),
        validationPlans: z.array(validationPlan),
        aiRuns: z.array(aiRun),
      })
      .strict(),
  })
  .strict();

const forbiddenSecretKeys = new Set([
  "apikey",
  "secret",
  "accesstoken",
  "refreshtoken",
  "bearertoken",
  "password",
  "authorization",
]);

function assertNoSecretKeys(value: unknown, path = "backup"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertNoSecretKeys(item, `${path}[${index}]`),
    );
    return;
  }

  if (value === null || typeof value !== "object") {
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    const normalizedKey = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
    if (forbiddenSecretKeys.has(normalizedKey)) {
      throw new DomainError(
        "INVALID_BACKUP",
        `备份包含不允许的秘密字段：${path}.${key}`,
      );
    }
    assertNoSecretKeys(child, `${path}.${key}`);
  });
}

export function parseTraceBackup(value: unknown): TraceBackup {
  assertNoSecretKeys(value);
  const result = traceBackupSchema.safeParse(value);

  if (!result.success) {
    throw new DomainError("INVALID_BACKUP", "备份格式无效或版本不受支持。 ");
  }

  const backup = result.data as TraceBackup;
  assertBackupReferences(backup);
  return backup;
}

function assertBackupReferences(backup: TraceBackup): void {
  const data = backup.data;
  const ids = <T extends { id: string }>(rows: readonly T[]) =>
    new Set(rows.map((row) => row.id));
  const projectIds = ids(data.projects);
  const recordIds = ids(data.sourceRecords);
  const revisionIds = ids(data.recordRevisions);
  const citationIds = ids(data.citations);
  const evidenceIds = ids(data.evidenceItems);
  const weeklyReviewIds = ids(data.weeklyReviews);
  const weeklyRevisionIds = ids(data.weeklyReviewRevisions);
  const caseStudyIds = ids(data.caseStudies);
  const caseRevisionIds = ids(data.caseStudyRevisions);
  const blockIds = ids(data.outputBlocks);
  const claimIds = ids(data.capabilityClaims);

  data.sourceRecords.forEach((record) => {
    requireReference(
      revisionIds,
      record.currentRevisionId,
      `记录 ${record.id} 的当前修订`,
    );
    if (record.projectId)
      requireReference(projectIds, record.projectId, "记录所属项目");
  });
  data.recordRevisions.forEach((revision) =>
    requireReference(
      recordIds,
      revision.recordId,
      `修订 ${revision.id} 的记录`,
    ),
  );
  data.citations.forEach((citation) => {
    const targetIds =
      citation.targetKind === "source_record_revision"
        ? revisionIds
        : evidenceIds;
    requireReference(
      targetIds,
      citation.targetId,
      `引用 ${citation.id} 的目标`,
    );
    if (citation.recordId)
      requireReference(recordIds, citation.recordId, "引用所属记录");
  });
  data.evidenceItems.forEach((evidence) => {
    evidence.citationIds.forEach((citationId) =>
      requireReference(citationIds, citationId, `证据 ${evidence.id} 的来源`),
    );
    if (evidence.projectId)
      requireReference(projectIds, evidence.projectId, "证据所属项目");
  });
  data.weeklyReviews.forEach((review) =>
    requireReference(
      weeklyRevisionIds,
      review.currentRevisionId,
      `周报 ${review.id} 的当前修订`,
    ),
  );
  data.weeklyReviewRevisions.forEach((revision) => {
    requireReference(
      weeklyReviewIds,
      revision.weeklyReviewId,
      `周报修订 ${revision.id} 的周报`,
    );
    revision.blockIds.forEach((blockId) =>
      requireReference(blockIds, blockId, `周报修订 ${revision.id} 的内容块`),
    );
  });
  data.caseStudies.forEach((caseStudy) => {
    requireReference(
      caseRevisionIds,
      caseStudy.currentRevisionId,
      `案例 ${caseStudy.id} 的当前修订`,
    );
    caseStudy.includedEvidenceIds.forEach((evidenceId) =>
      requireReference(
        evidenceIds,
        evidenceId,
        `案例 ${caseStudy.id} 的纳入证据`,
      ),
    );
    caseStudy.excludedEvidenceIds.forEach((evidenceId) =>
      requireReference(
        evidenceIds,
        evidenceId,
        `案例 ${caseStudy.id} 的排除证据`,
      ),
    );
  });
  data.caseStudyRevisions.forEach((revision) => {
    requireReference(
      caseStudyIds,
      revision.caseStudyId,
      `案例修订 ${revision.id} 的案例`,
    );
    revision.blockIds.forEach((blockId) =>
      requireReference(blockIds, blockId, `案例修订 ${revision.id} 的内容块`),
    );
  });
  data.outputBlocks.forEach((block) => {
    const ownerIds =
      block.ownerKind === "weekly_review_revision"
        ? weeklyRevisionIds
        : caseRevisionIds;
    requireReference(ownerIds, block.ownerId, `内容块 ${block.id} 的所属修订`);
    block.citationIds.forEach((citationId) =>
      requireReference(citationIds, citationId, `内容块 ${block.id} 的来源`),
    );
    if (block.capabilityClaimId)
      requireReference(
        claimIds,
        block.capabilityClaimId,
        "内容块关联的能力主张",
      );
  });
  data.capabilityClaims.forEach((claim) => {
    [
      ...claim.behaviorEvidenceIds,
      ...claim.outcomeEvidenceIds,
      ...claim.feedbackEvidenceIds,
    ].forEach((evidenceId) =>
      requireReference(evidenceIds, evidenceId, `能力主张 ${claim.id} 的证据`),
    );
    claim.caseStudyIds.forEach((caseStudyId) =>
      requireReference(
        caseStudyIds,
        caseStudyId,
        `能力主张 ${claim.id} 的案例`,
      ),
    );
  });
  data.validationPlans.forEach((plan) => {
    requireReference(
      evidenceIds,
      plan.hypothesisEvidenceId,
      `验证计划 ${plan.id} 的假设证据`,
    );
    if (plan.outcomeEvidenceId)
      requireReference(
        evidenceIds,
        plan.outcomeEvidenceId,
        `验证计划 ${plan.id} 的结果证据`,
      );
  });
}

function requireReference(
  availableIds: ReadonlySet<string>,
  id: string,
  label: string,
): void {
  if (!availableIds.has(id)) {
    throw new DomainError(
      "INVALID_BACKUP",
      `备份引用断裂：${label}找不到 ${id}。`,
    );
  }
}
