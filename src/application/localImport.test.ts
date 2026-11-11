import { describe, expect, it } from "vitest";
import {
  materializeCompanionImport,
  materializeLocalFileImport,
  parseLocalFilePreview,
} from "./localImport";

const runtime = {
  createId: (() => {
    let index = 0;
    return () => `id-${++index}`;
  })(),
  now: () => "2026-08-13T08:00:00.000Z",
};

describe("local file import", () => {
  it("previews JSON records without writing evidence", () => {
    const preview = parseLocalFilePreview({
      previewId: "preview-1",
      fileName: "notes.json",
      content: JSON.stringify({
        records: [
          {
            id: "note-1",
            occurredOn: "2026-08-12",
            title: "改了一版结构",
            text: "我根据访谈反馈调整了内容结构。",
          },
        ],
      }),
      importDate: "2026-08-13",
    });

    expect(preview.selectedCount).toBe(1);
    expect(preview.items[0]).toMatchObject({
      externalId: "note-1",
      occurredOn: "2026-08-12",
      dateSource: "provided",
    });
    expect(materializeLocalFileImport(preview, runtime)).toMatchObject({
      batch: {
        provider: "local_file",
        transport: "file_picker",
        status: "confirmed",
        importedCount: 1,
      },
    });
  });

  it("uses the import date transparently when a text file has no date", () => {
    const preview = parseLocalFilePreview({
      previewId: "preview-2",
      fileName: "today.txt",
      content: "记录一段还没有明确日期的工作痕迹。",
      importDate: "2026-08-13",
    });

    expect(preview.items[0]).toMatchObject({
      occurredOn: "2026-08-13",
      dateSource: "import_date",
    });
  });

  it("rejects a Trace backup in the file-import flow", () => {
    expect(() =>
      parseLocalFilePreview({
        previewId: "preview-3",
        fileName: "trace-backup.json",
        content: JSON.stringify({ format: "trace-backup" }),
        importDate: "2026-08-13",
      }),
    ).toThrowError(/恢复备份/);
  });

  it("keeps companion provider attribution and waits for explicit confirmation", () => {
    const preview = {
      protocol: "trace-local-companion" as const,
      protocolVersion: 1 as const,
      previewId: "preview-companion",
      provider: "codex" as const,
      scopeSummary: "Codex · task-1",
      selectedCount: 1,
      items: [
        {
          externalId: "task-1",
          occurredOn: "2026-08-13",
          title: "任务一",
          text: "完成了一次明确选择。",
        },
      ],
      expiresAt: "2026-08-13T08:10:00.000Z",
    };
    const materialized = materializeCompanionImport(
      { preview, items: preview.items },
      runtime,
    );

    expect(materialized.batch).toMatchObject({
      provider: "codex",
      transport: "local_companion",
      selectedCount: 1,
    });
    expect(materialized.records[0]?.sourceAttribution).toMatchObject({
      origin: "codex_task",
      providerLabel: "Codex",
      externalId: "task-1",
      importBatchId: materialized.batch.id,
    });
  });
});
