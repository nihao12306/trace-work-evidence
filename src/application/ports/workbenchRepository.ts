import type {
  Citation,
  CaseStudy,
  CaseStudyRevision,
  CapabilityClaim,
  EvidenceItem,
  ImportBatch,
  Project,
  RecordRevision,
  SourceRecord,
  OutputBlock,
  WeeklyReview,
  WeeklyReviewRevision,
  WorkspaceSettings,
  AiRun,
} from "../../domain/model";

export interface WorkbenchSnapshot {
  settings?: WorkspaceSettings;
  projects: Project[];
  records: SourceRecord[];
  revisions: RecordRevision[];
  evidenceItems: EvidenceItem[];
  citations: Citation[];
  importBatches: ImportBatch[];
  weeklyReviews: WeeklyReview[];
  weeklyReviewRevisions: WeeklyReviewRevision[];
  caseStudies: CaseStudy[];
  caseStudyRevisions: CaseStudyRevision[];
  capabilityClaims: CapabilityClaim[];
  outputBlocks: OutputBlock[];
  aiRuns: AiRun[];
}

export interface WorkbenchRepository {
  getSnapshot(): Promise<WorkbenchSnapshot>;
  saveWorkspaceSettings(settings: WorkspaceSettings): Promise<void>;
  createProject(project: Project): Promise<void>;
  updateProject(project: Project): Promise<void>;
  updateRecord(record: SourceRecord): Promise<void>;
  createRecord(
    record: SourceRecord,
    initialRevision: RecordRevision,
  ): Promise<void>;
  addRecordRevision(
    record: SourceRecord,
    revision: RecordRevision,
    citations: Citation[],
  ): Promise<void>;
  createEvidence(evidence: EvidenceItem, citation: Citation): Promise<void>;
  createEvidenceBatch(
    evidence: EvidenceItem[],
    citations: Citation[],
  ): Promise<void>;
  updateEvidence(evidence: EvidenceItem): Promise<void>;
  updateCitation(citation: Citation): Promise<void>;
  createWeeklyReview(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
  ): Promise<void>;
  createCaseStudyWithRevision(
    caseStudy: CaseStudy,
    revision: CaseStudyRevision,
    blocks: OutputBlock[],
  ): Promise<void>;
  updateCaseStudy(caseStudy: CaseStudy): Promise<void>;
  createCaseStudyRevisionWithBlocks(
    caseStudy: CaseStudy,
    revision: CaseStudyRevision,
    blocks: OutputBlock[],
  ): Promise<void>;
  finalizeCaseStudy(
    caseStudy: CaseStudy,
    revision: CaseStudyRevision,
  ): Promise<void>;
  createCapabilityClaim(claim: CapabilityClaim): Promise<void>;
  updateCapabilityClaim(claim: CapabilityClaim): Promise<void>;
  updateWeeklyReview(review: WeeklyReview): Promise<void>;
  updateWeeklyReviewRevision(revision: WeeklyReviewRevision): Promise<void>;
  createOutputBlocks(blocks: OutputBlock[]): Promise<void>;
  createOutputBlocksWithRevision(
    blocks: OutputBlock[],
    revision: WeeklyReviewRevision,
  ): Promise<void>;
  createWeeklyRevisionWithBlocks(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
    blocks: OutputBlock[],
  ): Promise<void>;
  finalizeWeeklyReview(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
  ): Promise<void>;
  updateOutputBlock(block: OutputBlock): Promise<void>;
  createAiRun(aiRun: AiRun): Promise<void>;
  updateAiRun(aiRun: AiRun): Promise<void>;
  createAiRunWithEvidence(
    aiRun: AiRun,
    evidence: EvidenceItem[],
    citations: Citation[],
  ): Promise<void>;
  createAiRunWithWeeklyBlocks(
    aiRun: AiRun,
    blocks: OutputBlock[],
    revision: WeeklyReviewRevision,
  ): Promise<void>;
  createAiRunWithCaseBlocks(
    aiRun: AiRun,
    blocks: OutputBlock[],
    revision: CaseStudyRevision,
  ): Promise<void>;
}
