export type EntityId = string;
export type ISODate = string;
export type ISODateTime = string;

export interface EntityMeta {
  id: EntityId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  schemaVersion: number;
}

export type AuthorKind = "user" | "ai" | "system";
export type ReviewState = "draft" | "proposed" | "confirmed" | "rejected";
export type EpistemicKind =
  "observed_fact" | "user_judgment" | "ai_inference" | "hypothesis";

export type EvidenceType =
  | "action"
  | "problem"
  | "decision"
  | "result"
  | "feedback"
  | "learning"
  | "hypothesis";

export type WeeklySectionKey =
  | "focus"
  | "results"
  | "went_well"
  | "problems"
  | "supported_causes"
  | "inferred_causes"
  | "next_validations"
  | "personal_reflection";

export type CaseSectionKey =
  | "background"
  | "problem"
  | "judgment"
  | "action"
  | "iteration"
  | "result"
  | "capability";

export interface CareerProfile {
  currentRole: string;
  targetDirections: string;
  preferredWork: string;
  constraints: string;
  dealBreakers: string;
  updatedAt: ISODateTime;
}

export interface WorkspaceSettings extends EntityMeta {
  displayName: string;
  locale: "zh-CN";
  timezone: string;
  weekStartsOn: 0 | 1;
  aiMode: "off" | "demo" | "custom_endpoint";
  aiEndpointConfig?: {
    endpoint: string;
    modelLabel?: string;
  };
  careerProfile?: CareerProfile;
  demoDataLoaded: boolean;
}

export interface Project extends EntityMeta {
  name: string;
  description?: string;
  status: "active" | "paused" | "completed" | "archived";
  startedOn?: ISODate;
  endedOn?: ISODate;
  colorToken?: "clay" | "moss" | "slate" | "ochre";
}

export interface StructuredRecordFields {
  action?: string;
  problem?: string;
  currentResult?: string;
  oneLineJudgment?: string;
}

export type SourceOriginKind =
  "manual" | "file_import" | "feishu_document" | "codex_task";

export interface SourceAttribution {
  origin: SourceOriginKind;
  providerLabel: string;
  externalId?: string;
  locator?: string;
  importedAt?: ISODateTime;
  importBatchId?: EntityId;
}

export interface SourceRecord extends EntityMeta {
  occurredOn: ISODate;
  projectId?: EntityId;
  originalText: string;
  originalStructuredInput?: StructuredRecordFields;
  currentRevisionId: EntityId;
  sourceLabel?: string;
  sourceAttribution?: SourceAttribution;
  lifecycle: "active" | "archived" | "trashed";
}

export type ImportProvider = "local_file" | "feishu" | "codex";

export interface ImportBatch extends EntityMeta {
  provider: ImportProvider;
  transport: "file_picker" | "local_companion";
  scopeSummary: string;
  selectedCount: number;
  importedCount: number;
  status: "preview" | "confirmed" | "rejected" | "failed";
  failureMessage?: string;
}

export interface RecordRevision extends EntityMeta {
  recordId: EntityId;
  revisionNumber: number;
  text: string;
  structuredInput?: StructuredRecordFields;
  changeNote?: string;
  author: "user";
}

export interface EvidenceItem extends EntityMeta {
  projectId?: EntityId;
  occurredOn: ISODate;
  type: EvidenceType;
  statement: string;
  epistemicKind: EpistemicKind;
  reviewState: ReviewState;
  resultStage?: "interim" | "final";
  authoredBy: AuthorKind;
  aiRunId?: EntityId;
  confirmedAt?: ISODateTime;
  confirmedByUser: boolean;
  rejectionReason?: string;
  citationIds: EntityId[];
}

export interface Citation extends EntityMeta {
  targetKind: "source_record_revision" | "evidence_item";
  targetId: EntityId;
  recordId?: EntityId;
  quoteSnapshot: string;
  fieldPath?: string;
  charRange?: { start: number; end: number };
  validity: "valid" | "stale" | "missing";
}

export interface WeeklyReview extends EntityMeta {
  weekStart: ISODate;
  weekEnd: ISODate;
  timezone: string;
  status: "draft" | "in_review" | "finalized";
  currentRevisionId: EntityId;
  finalizedAt?: ISODateTime;
}

export interface WeeklyReviewRevision extends EntityMeta {
  weeklyReviewId: EntityId;
  revisionNumber: number;
  statusSnapshot: WeeklyReview["status"];
  blockIds: EntityId[];
  createdBy: "user" | "system";
}

export interface OutputBlock extends EntityMeta {
  ownerKind: "weekly_review_revision" | "case_study_revision";
  ownerId: EntityId;
  sectionKey: WeeklySectionKey | CaseSectionKey;
  order: number;
  content: string;
  epistemicKind: EpistemicKind;
  reviewState: ReviewState;
  authoredBy: AuthorKind;
  authorshipNote?: "user_written" | "ai_drafted" | "ai_drafted_user_edited";
  rejectionReason?: string;
  citationIds: EntityId[];
  aiRunId?: EntityId;
  capabilityClaimId?: EntityId;
}

export interface ValidationPlan extends EntityMeta {
  hypothesisEvidenceId: EntityId;
  question: string;
  validationAction: string;
  expectedSignal?: string;
  targetDate?: ISODate;
  status: "planned" | "observed" | "closed";
  outcomeEvidenceId?: EntityId;
}

export interface CaseStudy extends EntityMeta {
  projectId: EntityId;
  title: string;
  rangeStart: ISODate;
  rangeEnd: ISODate;
  includedEvidenceIds: EntityId[];
  excludedEvidenceIds: EntityId[];
  status: "draft" | "in_review" | "finalized";
  currentRevisionId: EntityId;
  finalizedAt?: ISODateTime;
}

export interface CaseStudyRevision extends EntityMeta {
  caseStudyId: EntityId;
  revisionNumber: number;
  blockIds: EntityId[];
  createdBy: "user" | "system";
}

export interface CapabilityClaim extends EntityMeta {
  title: string;
  statement: string;
  scope: "single_project" | "cross_project";
  reviewState: ReviewState;
  authoredBy: AuthorKind;
  aiRunId?: EntityId;
  context: string;
  behaviorEvidenceIds: EntityId[];
  outcomeEvidenceIds: EntityId[];
  feedbackEvidenceIds: EntityId[];
  caseStudyIds: EntityId[];
  limitations?: string;
}

export interface AiRun extends EntityMeta {
  task:
    | "extract_evidence"
    | "draft_weekly_review"
    | "draft_case_study"
    | "rewrite_block";
  adapter: "demo" | "custom_endpoint";
  modelLabel: string;
  promptVersion: string;
  inputRefs: Array<{ kind: string; id: EntityId; revisionId?: EntityId }>;
  status: "running" | "succeeded" | "failed" | "cancelled";
  startedAt: ISODateTime;
  completedAt?: ISODateTime;
  errorCode?: string;
  outputEntityIds: EntityId[];
}

export interface TraceData {
  workspaceSettings: WorkspaceSettings[];
  projects: Project[];
  sourceRecords: SourceRecord[];
  recordRevisions: RecordRevision[];
  importBatches: ImportBatch[];
  evidenceItems: EvidenceItem[];
  citations: Citation[];
  weeklyReviews: WeeklyReview[];
  weeklyReviewRevisions: WeeklyReviewRevision[];
  caseStudies: CaseStudy[];
  caseStudyRevisions: CaseStudyRevision[];
  outputBlocks: OutputBlock[];
  capabilityClaims: CapabilityClaim[];
  validationPlans: ValidationPlan[];
  aiRuns: AiRun[];
}

export interface TraceBackup {
  format: "trace-backup";
  formatVersion: number;
  exportedAt: ISODateTime;
  appVersion: string;
  checksum?: string;
  data: TraceData;
}

export interface WeekRange {
  start: ISODate;
  end: ISODate;
}
