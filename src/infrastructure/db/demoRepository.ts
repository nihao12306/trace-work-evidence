import { demoData } from "../../fixtures/demoData";
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

export async function loadDemoData(database: TraceDatabase): Promise<void> {
  await database.transaction("rw", database.tables, async () => {
    await Promise.all(database.tables.map((table) => table.clear()));

    for (const name of storeNames) {
      const rows = demoData[name];
      if (rows.length > 0) {
        await database.table(name).bulkAdd(rows);
      }
    }
  });
}
