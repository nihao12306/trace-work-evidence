import type { Transaction } from "dexie";
import { parseTraceBackup } from "../../domain/backup";
import type { ISODateTime, TraceBackup, TraceData } from "../../domain/model";
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

export async function readAllData(database: TraceDatabase): Promise<TraceData> {
  const [
    workspaceSettings,
    projects,
    sourceRecords,
    recordRevisions,
    importBatches,
    evidenceItems,
    citations,
    weeklyReviews,
    weeklyReviewRevisions,
    caseStudies,
    caseStudyRevisions,
    outputBlocks,
    capabilityClaims,
    validationPlans,
    aiRuns,
  ] = await Promise.all([
    database.workspaceSettings.toArray(),
    database.projects.toArray(),
    database.sourceRecords.toArray(),
    database.recordRevisions.toArray(),
    database.importBatches.toArray(),
    database.evidenceItems.toArray(),
    database.citations.toArray(),
    database.weeklyReviews.toArray(),
    database.weeklyReviewRevisions.toArray(),
    database.caseStudies.toArray(),
    database.caseStudyRevisions.toArray(),
    database.outputBlocks.toArray(),
    database.capabilityClaims.toArray(),
    database.validationPlans.toArray(),
    database.aiRuns.toArray(),
  ]);

  return {
    workspaceSettings,
    projects,
    sourceRecords,
    recordRevisions,
    importBatches,
    evidenceItems,
    citations,
    weeklyReviews,
    weeklyReviewRevisions,
    caseStudies,
    caseStudyRevisions,
    outputBlocks,
    capabilityClaims,
    validationPlans,
    aiRuns,
  };
}

export async function exportBackup(
  database: TraceDatabase,
  exportedAt: ISODateTime,
  appVersion: string,
): Promise<TraceBackup> {
  const data = await database.transaction("r", database.tables, () =>
    readAllData(database),
  );

  return {
    format: "trace-backup",
    formatVersion: 1,
    exportedAt,
    appVersion,
    data,
  };
}

export async function replaceFromBackup(
  database: TraceDatabase,
  untrustedBackup: unknown,
): Promise<void> {
  const backup = parseTraceBackup(untrustedBackup);

  await database.transaction(
    "rw",
    database.tables,
    async (transaction: Transaction) => {
      await Promise.all(
        storeNames.map((name) => transaction.table(name).clear()),
      );

      for (const name of storeNames) {
        const rows = backup.data[name];
        if (rows.length > 0) {
          await transaction.table(name).bulkAdd(rows);
        }
      }
    },
  );
}
