import Dexie, { type EntityTable } from "dexie";
import type {
  AiRun,
  CapabilityClaim,
  CaseStudy,
  CaseStudyRevision,
  Citation,
  EvidenceItem,
  ImportBatch,
  OutputBlock,
  Project,
  RecordRevision,
  SourceRecord,
  ValidationPlan,
  WeeklyReview,
  WeeklyReviewRevision,
  WorkspaceSettings,
} from "../../domain/model";

export class TraceDatabase extends Dexie {
  workspaceSettings!: EntityTable<WorkspaceSettings, "id">;
  projects!: EntityTable<Project, "id">;
  sourceRecords!: EntityTable<SourceRecord, "id">;
  recordRevisions!: EntityTable<RecordRevision, "id">;
  importBatches!: EntityTable<ImportBatch, "id">;
  evidenceItems!: EntityTable<EvidenceItem, "id">;
  citations!: EntityTable<Citation, "id">;
  weeklyReviews!: EntityTable<WeeklyReview, "id">;
  weeklyReviewRevisions!: EntityTable<WeeklyReviewRevision, "id">;
  caseStudies!: EntityTable<CaseStudy, "id">;
  caseStudyRevisions!: EntityTable<CaseStudyRevision, "id">;
  outputBlocks!: EntityTable<OutputBlock, "id">;
  capabilityClaims!: EntityTable<CapabilityClaim, "id">;
  validationPlans!: EntityTable<ValidationPlan, "id">;
  aiRuns!: EntityTable<AiRun, "id">;

  constructor(name = "trace-work-evidence-v1") {
    super(name);

    const v1Stores = {
      workspaceSettings: "id",
      projects: "id,status,updatedAt",
      sourceRecords: "id,occurredOn,projectId,[projectId+occurredOn],lifecycle",
      recordRevisions: "id,recordId,[recordId+revisionNumber]",
      evidenceItems:
        "id,occurredOn,projectId,type,reviewState,[projectId+occurredOn]",
      citations: "id,targetId,recordId,validity",
      weeklyReviews: "id,weekStart,status",
      weeklyReviewRevisions:
        "id,weeklyReviewId,[weeklyReviewId+revisionNumber]",
      caseStudies: "id,projectId,status",
      caseStudyRevisions: "id,caseStudyId,[caseStudyId+revisionNumber]",
      outputBlocks: "id,ownerId,[ownerId+sectionKey],reviewState",
      capabilityClaims: "id,scope,reviewState,updatedAt",
      validationPlans: "id,hypothesisEvidenceId,status",
      aiRuns: "id,task,status,createdAt",
    } as const;

    this.version(1).stores(v1Stores);
    this.version(2).stores({
      ...v1Stores,
      importBatches: "id,provider,status,createdAt",
    });
  }
}

export const traceDatabase = new TraceDatabase();
