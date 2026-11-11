import type { ImportProvider } from "../../domain/model";

export const LOCAL_COMPANION_PROTOCOL = "trace-local-companion" as const;
export const LOCAL_COMPANION_PROTOCOL_VERSION = 1 as const;

export interface CompanionHealth {
  protocol: typeof LOCAL_COMPANION_PROTOCOL;
  protocolVersion: typeof LOCAL_COMPANION_PROTOCOL_VERSION;
  companionVersion: string;
  status: "ready";
  capabilities: Array<"health" | "preview_import" | "confirm_import">;
  sources?: {
    feishu: {
      status: "ready" | "not_configured" | "unavailable";
      label: string;
    };
    codex: {
      status: "ready" | "not_configured" | "unavailable";
      label: string;
    };
  };
}

export interface CompanionPreviewItem {
  externalId: string;
  occurredOn: string;
  title: string;
  text: string;
  locator?: string | undefined;
  truncated?: boolean | undefined;
}

export interface CompanionImportPreview {
  protocol: typeof LOCAL_COMPANION_PROTOCOL;
  protocolVersion: typeof LOCAL_COMPANION_PROTOCOL_VERSION;
  previewId: string;
  provider: Exclude<ImportProvider, "local_file">;
  scopeSummary: string;
  selectedCount: number;
  items: CompanionPreviewItem[];
  notices?: string[] | undefined;
  expiresAt: string;
}

export interface CompanionImportConfirmation {
  protocol: typeof LOCAL_COMPANION_PROTOCOL;
  protocolVersion: typeof LOCAL_COMPANION_PROTOCOL_VERSION;
  previewId: string;
  status: "confirmed";
  selectedCount: number;
}

export interface LocalCompanionClient {
  checkHealth(): Promise<CompanionHealth>;
  requestPreview(input: {
    provider: Exclude<ImportProvider, "local_file">;
    scope: string;
  }): Promise<CompanionImportPreview>;
  confirmImport(input: {
    previewId: string;
    selectedExternalIds: string[];
  }): Promise<CompanionImportConfirmation>;
}
