import { WorkbenchService } from "../application/workbench";
import {
  materializeLocalFileImport,
  materializeCompanionImport,
  type LocalFileImportPreview,
  parseLocalFilePreview,
  type MaterializedLocalImport,
  type MaterializedCompanionImport,
} from "../application/localImport";
import type {
  CompanionImportPreview,
  CompanionPreviewItem,
} from "../application/ports/localCompanion";
import type { TraceBackup } from "../domain/model";
import { DexieTraceRepository } from "../infrastructure/db/dexieTraceRepository";
import { DexieWorkbenchRepository } from "../infrastructure/db/dexieWorkbenchRepository";
import {
  exportBackup as exportBackupFromDatabase,
  replaceFromBackup,
} from "../infrastructure/db/backupRepository";
import { loadDemoData } from "../infrastructure/db/demoRepository";
import { traceDatabase } from "../infrastructure/db/traceDatabase";
import { DemoAiAdapter } from "../infrastructure/ai/demoAiAdapter";
import { CustomEndpointAiAdapter } from "../infrastructure/ai/customEndpointAiAdapter";
import type { CareerProfile, WorkspaceSettings } from "../domain/model";
import { isValidTimeZone } from "../domain/date";

export const traceRepository = new DexieTraceRepository(traceDatabase);
export const workbenchRepository = new DexieWorkbenchRepository(traceDatabase);

export const workbenchService = new WorkbenchService(
  workbenchRepository,
  {
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  },
  new DemoAiAdapter(),
  (settings) => {
    const endpoint = settings.aiEndpointConfig?.endpoint?.trim();
    return endpoint ? new CustomEndpointAiAdapter(endpoint) : undefined;
  },
);

export async function initializeDemoWorkspace(): Promise<void> {
  await loadDemoData(traceDatabase);
}

export async function exportWorkspaceBackup(): Promise<TraceBackup> {
  return exportBackupFromDatabase(
    traceDatabase,
    new Date().toISOString(),
    "0.3.0",
  );
}

export async function restoreWorkspaceBackup(value: unknown): Promise<void> {
  await replaceFromBackup(traceDatabase, value);
}

export async function clearWorkspaceData(): Promise<void> {
  await traceRepository.clearAll();
}

export async function updateAiSettings(input: {
  mode: WorkspaceSettings["aiMode"];
  endpoint?: string;
}): Promise<void> {
  const snapshot = await workbenchRepository.getSnapshot();
  const current = snapshot.settings;
  if (!current) throw new Error("工作册尚未初始化，暂时不能保存 AI 设置。 ");
  const endpoint = input.endpoint?.trim();
  if (input.mode === "custom_endpoint") {
    if (!endpoint) throw new Error("请先填写自定义 AI 端点地址。 ");
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error();
      }
    } catch {
      throw new Error("自定义 AI 端点必须是 http 或 https 地址。 ");
    }
  }
  if (input.mode === "custom_endpoint" && endpoint) {
    await workbenchRepository.saveWorkspaceSettings({
      ...current,
      aiMode: input.mode,
      aiEndpointConfig: { endpoint },
      updatedAt: new Date().toISOString(),
    });
    return;
  }
  const { aiEndpointConfig: ignoredEndpointConfig, ...withoutEndpoint } =
    current;
  void ignoredEndpointConfig;
  await workbenchRepository.saveWorkspaceSettings({
    ...withoutEndpoint,
    aiMode: input.mode,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateWorkspacePreferences(input: {
  timezone: string;
  weekStartsOn: 0 | 1;
}): Promise<void> {
  const snapshot = await workbenchRepository.getSnapshot();
  const current = snapshot.settings;
  if (!current) throw new Error("工作册尚未初始化，暂时不能保存时间设置。 ");
  const timezone = input.timezone.trim();
  if (!isValidTimeZone(timezone)) {
    throw new Error("请输入有效的 IANA 时区，例如 Asia/Shanghai。 ");
  }
  await workbenchRepository.saveWorkspaceSettings({
    ...current,
    timezone,
    weekStartsOn: input.weekStartsOn,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateCareerProfile(
  input: Omit<CareerProfile, "updatedAt">,
): Promise<void> {
  const snapshot = await workbenchRepository.getSnapshot();
  const current = snapshot.settings;
  if (!current) throw new Error("工作册尚未初始化，暂时不能保存求职方向。 ");
  await workbenchRepository.saveWorkspaceSettings({
    ...current,
    careerProfile: {
      currentRole: input.currentRole.trim(),
      targetDirections: input.targetDirections.trim(),
      preferredWork: input.preferredWork.trim(),
      constraints: input.constraints.trim(),
      dealBreakers: input.dealBreakers.trim(),
      updatedAt: new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  });
}

export function previewLocalFile(input: {
  previewId: string;
  fileName: string;
  content: string;
  importDate: string;
}): LocalFileImportPreview {
  return parseLocalFilePreview(input);
}

export async function confirmLocalFileImport(
  preview: LocalFileImportPreview,
): Promise<MaterializedLocalImport> {
  const materialized = materializeLocalFileImport(preview, {
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
  await traceRepository.importRecords(
    materialized.batch,
    materialized.records,
    materialized.revisions,
  );
  return materialized;
}

export async function confirmCompanionImport(input: {
  preview: CompanionImportPreview;
  items: CompanionPreviewItem[];
}): Promise<MaterializedCompanionImport> {
  const materialized = materializeCompanionImport(input, {
    createId: () => crypto.randomUUID(),
    now: () => new Date().toISOString(),
  });
  await traceRepository.importRecords(
    materialized.batch,
    materialized.records,
    materialized.revisions,
  );
  return materialized;
}

export function removeImportedBatch(batchId: string): Promise<{
  removedRecordIds: string[];
  preservedRecordIds: string[];
}> {
  return traceRepository.removeImportedBatch(batchId);
}
