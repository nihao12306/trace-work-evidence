import type {
  EntityId,
  ISODate,
  ImportBatch,
  RecordRevision,
  SourceRecord,
} from "../domain/model";
import { DomainError } from "../domain/errors";
import type {
  CompanionImportPreview,
  CompanionPreviewItem,
} from "./ports/localCompanion";

const MAX_FILE_BYTES = 2_000_000;
const MAX_ITEMS = 200;

export type LocalImportFormat = "json" | "markdown" | "text";

export interface LocalImportPreviewItem {
  externalId: string;
  occurredOn: ISODate;
  dateSource: "provided" | "import_date";
  title: string;
  text: string;
  locator?: string;
}

export interface LocalFileImportPreview {
  previewId: EntityId;
  fileName: string;
  format: LocalImportFormat;
  scopeSummary: string;
  selectedCount: number;
  items: LocalImportPreviewItem[];
}

export interface ImportRuntime {
  createId(): EntityId;
  now(): string;
}

export interface MaterializedLocalImport {
  batch: ImportBatch;
  records: SourceRecord[];
  revisions: RecordRevision[];
}

export interface MaterializedCompanionImport {
  batch: ImportBatch;
  records: SourceRecord[];
  revisions: RecordRevision[];
}

export function parseLocalFilePreview(input: {
  previewId: EntityId;
  fileName: string;
  content: string;
  importDate: ISODate;
}): LocalFileImportPreview {
  const content = input.content.replace(/^\uFEFF/, "");
  if (content.length === 0) {
    throw invalidImport("文件内容为空，无法生成预览。");
  }
  if (content.length > MAX_FILE_BYTES) {
    throw invalidImport("文件超过 2 MB，请拆分后再导入。");
  }

  const extension = extensionOf(input.fileName);
  const format: LocalImportFormat =
    extension === "json"
      ? "json"
      : extension === "md" || extension === "markdown"
        ? "markdown"
        : "text";

  const items =
    format === "json"
      ? parseJsonItems(content, input.importDate)
      : [parseTextItem(content, input.fileName, input.importDate, format)];

  if (items.length === 0) {
    throw invalidImport("文件中没有可导入的记录。");
  }
  if (items.length > MAX_ITEMS) {
    throw invalidImport(`单次最多预览 ${MAX_ITEMS} 条记录，请分批导入。`);
  }

  return {
    previewId: input.previewId,
    fileName: input.fileName,
    format,
    scopeSummary: `${input.fileName} · ${items.length} 条记录`,
    selectedCount: items.length,
    items,
  };
}

export function materializeLocalFileImport(
  preview: LocalFileImportPreview,
  runtime: ImportRuntime,
): MaterializedLocalImport {
  const now = runtime.now();
  const batchId = runtime.createId();
  const records: SourceRecord[] = [];
  const revisions: RecordRevision[] = [];

  for (const item of preview.items) {
    const recordId = runtime.createId();
    const revisionId = runtime.createId();
    const record: SourceRecord = {
      id: recordId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      occurredOn: item.occurredOn,
      originalText: item.text,
      currentRevisionId: revisionId,
      sourceLabel: item.title || preview.fileName,
      sourceAttribution: {
        origin: "file_import",
        providerLabel: "本地文件",
        externalId: item.externalId,
        ...(item.locator ? { locator: item.locator } : {}),
        importedAt: now,
        importBatchId: batchId,
      },
      lifecycle: "active",
    };
    records.push(record);
    revisions.push({
      id: revisionId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      recordId,
      revisionNumber: 1,
      text: item.text,
      author: "user",
      changeNote: `从 ${preview.fileName} 导入`,
    });
  }

  return {
    batch: {
      id: batchId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      provider: "local_file",
      transport: "file_picker",
      scopeSummary: preview.scopeSummary,
      selectedCount: preview.selectedCount,
      importedCount: records.length,
      status: "confirmed",
    },
    records,
    revisions,
  };
}

export function materializeCompanionImport(
  input: {
    preview: CompanionImportPreview;
    items: CompanionPreviewItem[];
  },
  runtime: ImportRuntime,
): MaterializedCompanionImport {
  const now = runtime.now();
  const batchId = runtime.createId();
  const records: SourceRecord[] = [];
  const revisions: RecordRevision[] = [];
  const providerLabel = input.preview.provider === "feishu" ? "飞书" : "Codex";
  const origin =
    input.preview.provider === "feishu" ? "feishu_document" : "codex_task";

  for (const item of input.items) {
    const recordId = runtime.createId();
    const revisionId = runtime.createId();
    records.push({
      id: recordId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      occurredOn: item.occurredOn,
      originalText: item.text,
      currentRevisionId: revisionId,
      sourceLabel: item.title,
      sourceAttribution: {
        origin,
        providerLabel,
        externalId: item.externalId,
        ...(item.locator ? { locator: item.locator } : {}),
        importedAt: now,
        importBatchId: batchId,
      },
      lifecycle: "active",
    });
    revisions.push({
      id: revisionId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      recordId,
      revisionNumber: 1,
      text: item.text,
      author: "user",
      changeNote: `从${providerLabel}本地伴侣导入`,
    });
  }

  return {
    batch: {
      id: batchId,
      createdAt: now,
      updatedAt: now,
      schemaVersion: 1,
      provider: input.preview.provider,
      transport: "local_companion",
      scopeSummary: input.preview.scopeSummary,
      selectedCount: input.items.length,
      importedCount: records.length,
      status: "confirmed",
    },
    records,
    revisions,
  };
}

function parseJsonItems(
  content: string,
  importDate: ISODate,
): LocalImportPreviewItem[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch {
    throw invalidImport("JSON 文件无法解析，请检查逗号、引号和括号。");
  }

  if (isRecord(parsed) && parsed.format === "trace-backup") {
    throw invalidImport(
      "这是 Trace 备份文件，请使用“恢复备份”入口，而不是文件导入。",
    );
  }

  const rows = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.records)
      ? parsed.records
      : isRecord(parsed) && Array.isArray(parsed.items)
        ? parsed.items
        : undefined;
  if (!rows) {
    throw invalidImport("JSON 需要是记录数组，或包含 records/items 数组。");
  }

  return rows.map((row, index) => {
    if (!isRecord(row)) {
      throw invalidImport(`第 ${index + 1} 条记录不是对象。`);
    }
    const text = firstString(row, ["text", "originalText", "content"]);
    if (!text) {
      throw invalidImport(
        `第 ${index + 1} 条记录缺少 text/originalText/content。`,
      );
    }
    const suppliedDate = firstString(row, ["occurredOn", "date"]);
    const date = normalizeDate(suppliedDate) ?? importDate;
    const locator = firstString(row, ["locator", "url"]);
    return {
      externalId: firstString(row, ["externalId", "id"]) ?? `row-${index + 1}`,
      occurredOn: date,
      dateSource:
        suppliedDate && normalizeDate(suppliedDate)
          ? "provided"
          : "import_date",
      title: firstString(row, ["title", "name"]) ?? `导入记录 ${index + 1}`,
      text,
      ...(locator ? { locator } : {}),
    };
  });
}

function parseTextItem(
  content: string,
  fileName: string,
  importDate: ISODate,
  format: LocalImportFormat,
): LocalImportPreviewItem {
  const heading = content.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  const suppliedDate =
    content.match(
      /(?:^|\n)\s*(?:date|日期)\s*[:：]\s*(\d{4}-\d{2}-\d{2})/i,
    )?.[1] ?? content.match(/\b(\d{4}-\d{2}-\d{2})\b/)?.[1];
  const occurredOn = normalizeDate(suppliedDate) ?? importDate;
  const baseName = fileName.replace(/\.[^.]+$/, "").trim();
  return {
    externalId: fileName,
    occurredOn,
    dateSource:
      suppliedDate && normalizeDate(suppliedDate) ? "provided" : "import_date",
    title:
      heading ??
      (baseName || (format === "markdown" ? "Markdown 记录" : "文本记录")),
    text: content.trim(),
  };
}

function extensionOf(fileName: string): string {
  return fileName.toLowerCase().split(".").pop() ?? "";
}

function normalizeDate(value: string | undefined): ISODate | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

function firstString(
  value: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim())
      return candidate.trim();
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidImport(message: string): DomainError {
  return new DomainError("INVALID_IMPORT", message);
}
