import "fake-indexeddb/auto";
import { afterEach, describe, expect, it } from "vitest";
import { parseTraceBackup } from "../../domain/backup";
import {
  materializeLocalFileImport,
  parseLocalFilePreview,
} from "../../application/localImport";
import { demoData } from "../../fixtures/demoData";
import { exportBackup, replaceFromBackup } from "./backupRepository";
import { loadDemoData } from "./demoRepository";
import { TraceDatabase } from "./traceDatabase";

const databases: TraceDatabase[] = [];

function createDatabase(): TraceDatabase {
  const database = new TraceDatabase(`trace-test-${crypto.randomUUID()}`);
  databases.push(database);
  return database;
}

afterEach(async () => {
  await Promise.all(
    databases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    }),
  );
});

describe("backup repository", () => {
  it("round-trips the fixed demo data", async () => {
    const source = createDatabase();
    const target = createDatabase();
    await loadDemoData(source);

    const backup = await exportBackup(
      source,
      "2026-08-03T02:00:00.000Z",
      "0.1.0",
    );
    await replaceFromBackup(target, backup);
    const restored = await exportBackup(
      target,
      "2026-08-03T03:00:00.000Z",
      "0.1.0",
    );

    expect(restored.data).toEqual(backup.data);
    expect(restored.data.projects).toHaveLength(3);
    expect(restored.data.capabilityClaims).toHaveLength(1);
  });

  it("rejects secret-looking fields even when the rest of the backup is valid", () => {
    const unsafe = {
      format: "trace-backup",
      formatVersion: 1,
      exportedAt: "2026-08-03T02:00:00.000Z",
      appVersion: "0.1.0",
      apiKey: "must-not-be-exported",
      data: demoData,
    };

    expect(() => parseTraceBackup(unsafe)).toThrowError(/秘密字段/);
  });

  it("validates an import before clearing existing data", async () => {
    const database = createDatabase();
    await loadDemoData(database);
    const before = await database.projects.toArray();

    await expect(
      replaceFromBackup(database, { format: "wrong" }),
    ).rejects.toThrowError(/备份格式无效/);

    expect(await database.projects.toArray()).toEqual(before);
  });

  it("rejects broken references before clearing existing data", async () => {
    const database = createDatabase();
    await loadDemoData(database);
    const before = await database.sourceRecords.toArray();
    const backup = await exportBackup(
      database,
      "2026-08-03T04:00:00.000Z",
      "0.1.0",
    );
    backup.data.sourceRecords[0] = {
      ...backup.data.sourceRecords[0]!,
      currentRevisionId: "missing-revision",
    };

    await expect(replaceFromBackup(database, backup)).rejects.toThrowError(
      /备份引用断裂/,
    );
    expect(await database.sourceRecords.toArray()).toEqual(before);
  });

  it("writes a confirmed local file import atomically", async () => {
    const database = createDatabase();
    const preview = parseLocalFilePreview({
      previewId: "preview-db",
      fileName: "notes.json",
      content: JSON.stringify([
        { occurredOn: "2026-08-13", text: "本地导入的原始记录。" },
      ]),
      importDate: "2026-08-13",
    });
    const materialized = materializeLocalFileImport(preview, {
      createId: (() => {
        let index = 0;
        return () => `generated-${++index}`;
      })(),
      now: () => "2026-08-13T02:00:00.000Z",
    });

    const { DexieTraceRepository } = await import("./dexieTraceRepository");
    const repository = new DexieTraceRepository(database);
    await repository.importRecords(
      materialized.batch,
      materialized.records,
      materialized.revisions,
    );

    expect(await database.importBatches.toArray()).toHaveLength(1);
    expect(await database.sourceRecords.toArray()).toHaveLength(1);
    expect(await database.recordRevisions.toArray()).toHaveLength(1);
    expect(await database.evidenceItems.toArray()).toHaveLength(0);
  });

  it("removes an imported batch when no citation points to its revisions", async () => {
    const database = createDatabase();
    const preview = parseLocalFilePreview({
      previewId: "preview-remove",
      fileName: "notes.txt",
      content: "一条还没有被整理的导入记录。",
      importDate: "2026-08-13",
    });
    const materialized = materializeLocalFileImport(preview, {
      createId: (() => {
        let index = 0;
        return () => `remove-${++index}`;
      })(),
      now: () => "2026-08-13T02:00:00.000Z",
    });
    const { DexieTraceRepository } = await import("./dexieTraceRepository");
    const repository = new DexieTraceRepository(database);
    await repository.importRecords(
      materialized.batch,
      materialized.records,
      materialized.revisions,
    );

    await expect(
      repository.removeImportedBatch(materialized.batch.id),
    ).resolves.toEqual({
      removedRecordIds: [materialized.records[0]!.id],
      preservedRecordIds: [],
    });
    expect(await database.sourceRecords.toArray()).toHaveLength(0);
    expect(await database.importBatches.toArray()).toHaveLength(0);
  });

  it("preserves an imported record when a citation already references it", async () => {
    const database = createDatabase();
    const preview = parseLocalFilePreview({
      previewId: "preview-preserve",
      fileName: "notes.json",
      content: JSON.stringify([
        { occurredOn: "2026-08-13", text: "一条已经进入证据链的导入记录。" },
        { occurredOn: "2026-08-13", text: "一条还没有整理的导入记录。" },
        { occurredOn: "2026-08-13", text: "一条只有过期引用的导入记录。" },
      ]),
      importDate: "2026-08-13",
    });
    const materialized = materializeLocalFileImport(preview, {
      createId: (() => {
        let index = 0;
        return () => `preserve-${++index}`;
      })(),
      now: () => "2026-08-13T02:00:00.000Z",
    });
    const { DexieTraceRepository } = await import("./dexieTraceRepository");
    const repository = new DexieTraceRepository(database);
    await repository.importRecords(
      materialized.batch,
      materialized.records,
      materialized.revisions,
    );
    await database.citations.add({
      id: "preserve-citation",
      createdAt: "2026-08-13T02:00:00.000Z",
      updatedAt: "2026-08-13T02:00:00.000Z",
      schemaVersion: 1,
      targetKind: "source_record_revision",
      targetId: materialized.revisions[0]!.id,
      recordId: materialized.records[0]!.id,
      quoteSnapshot: materialized.revisions[0]!.text,
      validity: "valid",
    });
    await database.citations.add({
      id: "preserve-missing-citation",
      createdAt: "2026-08-13T02:00:00.000Z",
      updatedAt: "2026-08-13T02:00:00.000Z",
      schemaVersion: 1,
      targetKind: "source_record_revision",
      targetId: materialized.revisions[1]!.id,
      recordId: materialized.records[1]!.id,
      quoteSnapshot: materialized.revisions[1]!.text,
      validity: "missing",
    });

    await expect(
      repository.removeImportedBatch(materialized.batch.id),
    ).resolves.toEqual({
      removedRecordIds: [materialized.records[2]!.id],
      preservedRecordIds: [
        materialized.records[0]!.id,
        materialized.records[1]!.id,
      ],
    });
    expect(await database.sourceRecords.toArray()).toHaveLength(2);
    expect(await database.importBatches.toArray()).toHaveLength(1);
    expect(
      (await database.importBatches.get(materialized.batch.id))?.importedCount,
    ).toBe(2);
  });
});
