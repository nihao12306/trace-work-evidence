import type { TraceRepository } from "../../application/ports/traceRepository";
import type {
  ImportBatch,
  RecordRevision,
  SourceRecord,
  TraceData,
} from "../../domain/model";
import { readAllData } from "./backupRepository";
import type { TraceDatabase } from "./traceDatabase";

const storeNames = [
  "workspaceSettings",
  "projects",
  "sourceRecords",
  "recordRevisions",
  "importBatches",
  "evidenceItems",
  "citations",
  "weeklyReviews",
  "weeklyReviewRevisions",
  "caseStudies",
  "caseStudyRevisions",
  "outputBlocks",
  "capabilityClaims",
  "validationPlans",
  "aiRuns",
] as const;

export class DexieTraceRepository implements TraceRepository {
  constructor(private readonly database: TraceDatabase) {}

  readAll(): Promise<TraceData> {
    return this.database.transaction("r", this.database.tables, () =>
      readAllData(this.database),
    );
  }

  async replaceAll(data: TraceData): Promise<void> {
    await this.database.transaction("rw", this.database.tables, async () => {
      await Promise.all(this.database.tables.map((table) => table.clear()));
      for (const name of storeNames) {
        const rows = data[name];
        if (rows.length > 0) {
          await this.database.table(name).bulkAdd(rows);
        }
      }
    });
  }

  async clearAll(): Promise<void> {
    await this.database.transaction("rw", this.database.tables, async () => {
      await Promise.all(this.database.tables.map((table) => table.clear()));
    });
  }

  async importRecords(
    batch: ImportBatch,
    records: SourceRecord[],
    revisions: RecordRevision[],
  ): Promise<void> {
    await this.database.transaction(
      "rw",
      [
        this.database.importBatches,
        this.database.sourceRecords,
        this.database.recordRevisions,
      ],
      async () => {
        await this.database.importBatches.add(batch);
        if (records.length > 0) {
          await this.database.sourceRecords.bulkAdd(records);
        }
        if (revisions.length > 0) {
          await this.database.recordRevisions.bulkAdd(revisions);
        }
      },
    );
  }

  async removeImportedBatch(batchId: string): Promise<{
    removedRecordIds: string[];
    preservedRecordIds: string[];
  }> {
    return this.database.transaction(
      "rw",
      [
        this.database.importBatches,
        this.database.sourceRecords,
        this.database.recordRevisions,
        this.database.citations,
      ],
      async () => {
        const batch = await this.database.importBatches.get(batchId);
        if (!batch) throw new Error("没有找到这批导入材料。 ");
        const records = await this.database.sourceRecords
          .filter(
            (record) => record.sourceAttribution?.importBatchId === batchId,
          )
          .toArray();
        const revisions = await this.database.recordRevisions.toArray();
        const citations = await this.database.citations.toArray();
        // 即使引用已经过期或标记为缺失，也不能删除它所指向的修订；
        // 否则备份会留下无法解析的引用，破坏证据链的可回溯性。
        const citedRevisionIds = new Set(
          citations.map((citation) => citation.targetId),
        );
        const removable = records.filter((record) => {
          const recordRevisionIds = revisions
            .filter((revision) => revision.recordId === record.id)
            .map((revision) => revision.id);
          return recordRevisionIds.every((id) => !citedRevisionIds.has(id));
        });
        const preserved = records.filter(
          (record) => !removable.some((item) => item.id === record.id),
        );

        if (removable.length > 0) {
          const removableIds = new Set(removable.map((record) => record.id));
          const removableRevisionIds = revisions
            .filter((revision) => removableIds.has(revision.recordId))
            .map((revision) => revision.id);
          await this.database.sourceRecords.bulkDelete([...removableIds]);
          await this.database.recordRevisions.bulkDelete(removableRevisionIds);
        }
        if (preserved.length === 0) {
          await this.database.importBatches.delete(batchId);
        } else if (removable.length > 0) {
          await this.database.importBatches.update(batchId, {
            importedCount: preserved.length,
          });
        }
        return {
          removedRecordIds: removable.map((record) => record.id),
          preservedRecordIds: preserved.map((record) => record.id),
        };
      },
    );
  }
}
