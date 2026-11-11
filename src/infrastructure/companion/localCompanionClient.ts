import { z } from "zod";
import {
  LOCAL_COMPANION_PROTOCOL,
  LOCAL_COMPANION_PROTOCOL_VERSION,
  type CompanionHealth,
  type CompanionImportConfirmation,
  type CompanionImportPreview,
  type LocalCompanionClient as LocalCompanionClientPort,
} from "../../application/ports/localCompanion";

const healthSchema = z
  .object({
    protocol: z.literal(LOCAL_COMPANION_PROTOCOL),
    protocolVersion: z.literal(LOCAL_COMPANION_PROTOCOL_VERSION),
    companionVersion: z.string().min(1),
    status: z.literal("ready"),
    capabilities: z.array(
      z.enum(["health", "preview_import", "confirm_import"]),
    ),
    sources: z
      .object({
        feishu: z.object({
          status: z.enum(["ready", "not_configured", "unavailable"]),
          label: z.string().min(1),
        }),
        codex: z.object({
          status: z.enum(["ready", "not_configured", "unavailable"]),
          label: z.string().min(1),
        }),
      })
      .optional(),
  })
  .strict();

const previewSchema = z
  .object({
    protocol: z.literal(LOCAL_COMPANION_PROTOCOL),
    protocolVersion: z.literal(LOCAL_COMPANION_PROTOCOL_VERSION),
    previewId: z.string().min(1),
    provider: z.enum(["feishu", "codex"]),
    scopeSummary: z.string().min(1),
    selectedCount: z.number().int().nonnegative(),
    items: z.array(
      z
        .object({
          externalId: z.string().min(1),
          occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          title: z.string().min(1),
          text: z.string().min(1),
          locator: z.string().optional(),
          truncated: z.boolean().optional(),
        })
        .strict(),
    ),
    notices: z.array(z.string().min(1)).optional(),
    expiresAt: z.string().datetime({ offset: true }),
  })
  .strict();

const confirmationSchema = z
  .object({
    protocol: z.literal(LOCAL_COMPANION_PROTOCOL),
    protocolVersion: z.literal(LOCAL_COMPANION_PROTOCOL_VERSION),
    previewId: z.string().min(1),
    status: z.literal("confirmed"),
    selectedCount: z.number().int().nonnegative(),
  })
  .strict();

export class CompanionUnavailableError extends Error {
  constructor(message = "本地伴侣未运行。") {
    super(message);
    this.name = "CompanionUnavailableError";
  }
}

export class CompanionProtocolError extends Error {
  constructor(message = "本地伴侣返回了无法识别的数据。") {
    super(message);
    this.name = "CompanionProtocolError";
  }
}

export class HttpLocalCompanionClient implements LocalCompanionClientPort {
  constructor(
    private readonly baseUrl = "http://127.0.0.1:43817",
    private readonly timeoutMs = 15_000,
  ) {}

  async checkHealth(): Promise<CompanionHealth> {
    const payload = await this.request("/health", { method: "GET" });
    const parsed = healthSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CompanionProtocolError(
        "本地伴侣协议版本不兼容，请更新伴侣程序。",
      );
    }
    const data = parsed.data;
    const base = {
      protocol: data.protocol,
      protocolVersion: data.protocolVersion,
      companionVersion: data.companionVersion,
      status: data.status,
      capabilities: data.capabilities,
    };
    return data.sources ? { ...base, sources: data.sources } : base;
  }

  async requestPreview(input: {
    provider: "feishu" | "codex";
    scope: string;
  }): Promise<CompanionImportPreview> {
    const payload = await this.request("/v1/import/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const parsed = previewSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CompanionProtocolError(
        "导入预览格式无效，未写入任何本地数据。",
      );
    }
    return parsed.data;
  }

  async confirmImport(input: {
    previewId: string;
    selectedExternalIds: string[];
  }): Promise<CompanionImportConfirmation> {
    const payload = await this.request("/v1/import/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    const parsed = confirmationSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CompanionProtocolError(
        "导入确认响应格式无效，本地工作册没有被修改。",
      );
    }
    return parsed.data;
  }

  private async request(path: string, init: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        ...init,
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          ...init.headers,
        },
      });
      if (!response.ok) {
        throw new CompanionUnavailableError(
          `本地伴侣返回了 ${response.status}，请检查伴侣程序状态。`,
        );
      }
      return await response.json();
    } catch (error) {
      if (error instanceof CompanionUnavailableError) throw error;
      throw new CompanionUnavailableError();
    } finally {
      window.clearTimeout(timeout);
    }
  }
}

export const localCompanionClient = new HttpLocalCompanionClient();
