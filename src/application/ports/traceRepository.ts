import type {
  ImportBatch,
  RecordRevision,
  SourceRecord,
  TraceData,
} from "../../domain/model";

export interface TraceRepository {
  readAll(): Promise<TraceData>;
  replaceAll(data: TraceData): Promise<void>;
  clearAll(): Promise<void>;
  importRecords(
    batch: ImportBatch,
    records: SourceRecord[],
    revisions: RecordRevision[],
  ): Promise<void>;
  removeImportedBatch(batchId: string): Promise<{
    removedRecordIds: string[];
    preservedRecordIds: string[];
  }>;
}
