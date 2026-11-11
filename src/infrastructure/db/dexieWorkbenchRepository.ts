import type {
  WorkbenchRepository,
  WorkbenchSnapshot,
} from "../../application/ports/workbenchRepository";
import type {
  CaseStudy,
  CaseStudyRevision,
  CapabilityClaim,
  Citation,
  EvidenceItem,
  AiRun,
  OutputBlock,
  Project,
  RecordRevision,
  SourceRecord,
  WeeklyReview,
  WeeklyReviewRevision,
  WorkspaceSettings,
} from "../../domain/model";
import type { TraceDatabase } from "./traceDatabase";

export class DexieWorkbenchRepository implements WorkbenchRepository {
  constructor(private readonly database: TraceDatabase) {}

  async getSnapshot(): Promise<WorkbenchSnapshot> {
    const [
      settings,
      projects,
      records,
      revisions,
      importBatches,
      evidenceItems,
      citations,
      weeklyReviews,
      weeklyReviewRevisions,
      caseStudies,
      caseStudyRevisions,
      capabilityClaims,
      outputBlocks,
      aiRuns,
    ] = await this.database.transaction(
      "r",
      [
        this.database.workspaceSettings,
        this.database.projects,
        this.database.sourceRecords,
        this.database.recordRevisions,
        this.database.importBatches,
        this.database.evidenceItems,
        this.database.citations,
        this.database.weeklyReviews,
        this.database.weeklyReviewRevisions,
        this.database.caseStudies,
        this.database.caseStudyRevisions,
        this.database.capabilityClaims,
        this.database.outputBlocks,
        this.database.aiRuns,
      ],
      () =>
        Promise.all([
          this.database.workspaceSettings.toCollection().first(),
          this.database.projects.toArray(),
          this.database.sourceRecords.toArray(),
          this.database.recordRevisions.toArray(),
          this.database.importBatches.toArray(),
          this.database.evidenceItems.toArray(),
          this.database.citations.toArray(),
          this.database.weeklyReviews.toArray(),
          this.database.weeklyReviewRevisions.toArray(),
          this.database.caseStudies.toArray(),
          this.database.caseStudyRevisions.toArray(),
          this.database.capabilityClaims.toArray(),
          this.database.outputBlocks.toArray(),
          this.database.aiRuns.toArray(),
        ]),
    );

    return {
      ...(settings === undefined ? {} : { settings }),
      projects,
      records,
      revisions,
      importBatches,
      evidenceItems,
      citations,
      weeklyReviews,
      weeklyReviewRevisions,
      caseStudies,
      caseStudyRevisions,
      capabilityClaims,
      outputBlocks,
      aiRuns,
    };
  }

  async saveWorkspaceSettings(settings: WorkspaceSettings): Promise<void> {
    await this.database.workspaceSettings.put(settings);
  }

  async createProject(project: Project): Promise<void> {
    await this.database.projects.add(project);
  }

  async updateProject(project: Project): Promise<void> {
    await this.database.projects.put(project);
  }

  async updateRecord(record: SourceRecord): Promise<void> {
    await this.database.sourceRecords.put(record);
  }

  async createRecord(
    record: SourceRecord,
    initialRevision: RecordRevision,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.sourceRecords, this.database.recordRevisions],
      async () => {
        await this.database.sourceRecords.add(record);
        await this.database.recordRevisions.add(initialRevision);
      },
    );
  }

  async addRecordRevision(
    record: SourceRecord,
    revision: RecordRevision,
    citations: Citation[],
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.sourceRecords,
        this.database.recordRevisions,
        this.database.citations,
      ],
      async () => {
        await this.database.recordRevisions.add(revision);
        await this.database.sourceRecords.put(record);
        if (citations.length > 0)
          await this.database.citations.bulkPut(citations);
      },
    );
  }

  async createEvidence(
    evidence: EvidenceItem,
    citation: Citation,
  ): Promise<void> {
    await this.createEvidenceBatch([evidence], [citation]);
  }

  async createEvidenceBatch(
    evidence: EvidenceItem[],
    citations: Citation[],
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.evidenceItems, this.database.citations],
      async () => {
        if (citations.length > 0) {
          await this.database.citations.bulkAdd(citations);
        }
        if (evidence.length > 0) {
          await this.database.evidenceItems.bulkAdd(evidence);
        }
      },
    );
  }

  async updateEvidence(evidence: EvidenceItem): Promise<void> {
    await this.database.evidenceItems.put(evidence);
  }

  async updateCitation(citation: Citation): Promise<void> {
    await this.database.citations.put(citation);
  }

  async createWeeklyReview(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.weeklyReviews, this.database.weeklyReviewRevisions],
      async () => {
        await this.database.weeklyReviews.add(review);
        await this.database.weeklyReviewRevisions.add(revision);
      },
    );
  }

  async createCaseStudyWithRevision(
    caseStudy: CaseStudy,
    revision: CaseStudyRevision,
    blocks: OutputBlock[],
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.caseStudies,
        this.database.caseStudyRevisions,
        this.database.outputBlocks,
      ],
      async () => {
        await this.database.caseStudies.add(caseStudy);
        await this.database.caseStudyRevisions.add(revision);
        if (blocks.length > 0) {
          await this.database.outputBlocks.bulkAdd(blocks);
        }
      },
    );
  }

  async updateCaseStudy(caseStudy: CaseStudy): Promise<void> {
    await this.database.caseStudies.put(caseStudy);
  }

  async createCaseStudyRevisionWithBlocks(
    caseStudy: CaseStudy,
    revision: CaseStudyRevision,
    blocks: OutputBlock[],
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.caseStudies,
        this.database.caseStudyRevisions,
        this.database.outputBlocks,
      ],
      async () => {
        await this.database.caseStudies.put(caseStudy);
        await this.database.caseStudyRevisions.add(revision);
        if (blocks.length > 0) {
          await this.database.outputBlocks.bulkAdd(blocks);
        }
      },
    );
  }

  async finalizeCaseStudy(
    caseStudy: CaseStudy,
    revision: CaseStudyRevision,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.caseStudies, this.database.caseStudyRevisions],
      async () => {
        await this.database.caseStudies.put(caseStudy);
        await this.database.caseStudyRevisions.add(revision);
      },
    );
  }

  async createCapabilityClaim(claim: CapabilityClaim): Promise<void> {
    await this.database.capabilityClaims.add(claim);
  }

  async updateCapabilityClaim(claim: CapabilityClaim): Promise<void> {
    await this.database.capabilityClaims.put(claim);
  }

  async updateWeeklyReview(review: WeeklyReview): Promise<void> {
    await this.database.weeklyReviews.put(review);
  }

  async updateWeeklyReviewRevision(
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    await this.database.weeklyReviewRevisions.put(revision);
  }

  async createOutputBlocks(blocks: OutputBlock[]): Promise<void> {
    if (blocks.length === 0) return;
    await this.database.outputBlocks.bulkAdd(blocks);
  }

  async createOutputBlocksWithRevision(
    blocks: OutputBlock[],
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.outputBlocks, this.database.weeklyReviewRevisions],
      async () => {
        if (blocks.length > 0) await this.database.outputBlocks.bulkAdd(blocks);
        await this.database.weeklyReviewRevisions.put(revision);
      },
    );
  }

  async createWeeklyRevisionWithBlocks(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
    blocks: OutputBlock[],
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.weeklyReviews,
        this.database.weeklyReviewRevisions,
        this.database.outputBlocks,
      ],
      async () => {
        await this.database.weeklyReviews.put(review);
        await this.database.weeklyReviewRevisions.add(revision);
        if (blocks.length > 0) {
          await this.database.outputBlocks.bulkAdd(blocks);
        }
      },
    );
  }

  async finalizeWeeklyReview(
    review: WeeklyReview,
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [this.database.weeklyReviews, this.database.weeklyReviewRevisions],
      async () => {
        await this.database.weeklyReviews.put(review);
        await this.database.weeklyReviewRevisions.add(revision);
      },
    );
  }

  async updateOutputBlock(block: OutputBlock): Promise<void> {
    await this.database.outputBlocks.put(block);
  }

  async createAiRun(aiRun: AiRun): Promise<void> {
    await this.database.aiRuns.add(aiRun);
  }

  async updateAiRun(aiRun: AiRun): Promise<void> {
    await this.database.aiRuns.put(aiRun);
  }

  async createAiRunWithEvidence(
    aiRun: AiRun,
    evidence: EvidenceItem[],
    citations: Citation[],
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.aiRuns,
        this.database.evidenceItems,
        this.database.citations,
      ],
      async () => {
        await this.database.aiRuns.add(aiRun);
        if (citations.length > 0) {
          await this.database.citations.bulkAdd(citations);
        }
        if (evidence.length > 0) {
          await this.database.evidenceItems.bulkAdd(evidence);
        }
      },
    );
  }

  async createAiRunWithWeeklyBlocks(
    aiRun: AiRun,
    blocks: OutputBlock[],
    revision: WeeklyReviewRevision,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.aiRuns,
        this.database.outputBlocks,
        this.database.weeklyReviewRevisions,
      ],
      async () => {
        await this.database.aiRuns.add(aiRun);
        if (blocks.length > 0) {
          await this.database.outputBlocks.bulkAdd(blocks);
        }
        await this.database.weeklyReviewRevisions.put(revision);
      },
    );
  }

  async createAiRunWithCaseBlocks(
    aiRun: AiRun,
    blocks: OutputBlock[],
    revision: CaseStudyRevision,
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.aiRuns,
        this.database.outputBlocks,
        this.database.caseStudyRevisions,
      ],
      async () => {
        await this.database.aiRuns.add(aiRun);
        if (blocks.length > 0) {
          await this.database.outputBlocks.bulkAdd(blocks);
        }
        await this.database.caseStudyRevisions.put(revision);
      },
    );
  }
}
