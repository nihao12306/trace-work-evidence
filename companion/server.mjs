import fs from "node:fs/promises";
import http from "node:http";
import { parseFixtureRows } from "./fixture.mjs";
import { getSourceStatus, readSourceRows } from "./sourceReaders.mjs";

const host = process.env.TRACE_COMPANION_HOST ?? "127.0.0.1";
if (host !== "127.0.0.1" && host !== "localhost") {
  throw new Error("Trace 本地伴侣只允许监听本机回环地址。");
}
const port = Number(process.env.TRACE_COMPANION_PORT ?? 43817);
const protocol = "trace-local-companion";
const protocolVersion = 1;
const previews = new Map();
const MAX_ACTIVE_PREVIEWS = 20;
const allowedOrigins = new Set([
  "http://127.0.0.1:4173",
  "http://localhost:4173",
]);

function fixturePath() {
  return process.env.TRACE_COMPANION_FIXTURE_FILE ?? "";
}

function fixtureConfigured() {
  return Boolean(fixturePath() || process.env.TRACE_COMPANION_FIXTURE_JSON);
}

function sendJson(response, status, body) {
  const requestOrigin = response.req?.headers.origin;
  response.writeHead(status, {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...(allowedOrigins.has(requestOrigin)
      ? { "Access-Control-Allow-Origin": requestOrigin }
      : {}),
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
    Vary: "Origin",
  });
  response.end(JSON.stringify(body));
}

const server = http.createServer(async (request, response) => {
  const localPort = server.address().port;
  const localHosts = [`127.0.0.1:${localPort}`, `localhost:${localPort}`];
  if (
    !localHosts.includes(request.headers.host) ||
    (request.headers.origin && !allowedOrigins.has(request.headers.origin))
  ) {
    sendJson(response, 403, { error: "FORBIDDEN_ORIGIN" });
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    prunePreviews();
    const sources = await getSourceStatus();
    const hasReadableSource = Object.values(sources).some(
      (source) => source.status === "ready",
    );
    sendJson(response, 200, {
      protocol,
      protocolVersion,
      companionVersion: "0.3.0",
      status: "ready",
      capabilities:
        fixtureConfigured() || hasReadableSource
          ? ["health", "preview_import", "confirm_import"]
          : ["health"],
      sources,
    });
    return;
  }

  if (request.method === "POST" && request.url === "/v1/import/preview") {
    try {
      const input = await readJson(request);
      const provider = input.provider;
      const scope = typeof input.scope === "string" ? input.scope.trim() : "";
      if (provider !== "feishu" && provider !== "codex") {
        sendJson(response, 400, {
          error: "INVALID_PROVIDER",
          message: "来源必须是 feishu 或 codex。",
        });
        return;
      }
      if (
        !fixtureConfigured() &&
        (await getSourceStatus())[provider]?.status !== "ready"
      ) {
        sendJson(response, 501, {
          error: "SOURCE_NOT_CONFIGURED",
          message:
            provider === "feishu"
              ? "飞书来源尚未配置。请设置 TRACE_FEISHU_EXPORT_DIR 指向本地导出/同步目录。"
              : "没有找到 Codex 会话目录。请设置 TRACE_CODEX_HOME 指向包含 sessions 的目录。",
        });
        return;
      }
      if (!scope) {
        sendJson(response, 400, {
          error: "INVALID_SCOPE",
          message: "必须明确填写本次导入范围。",
        });
        return;
      }
      const sourceResult = fixtureConfigured()
        ? { items: await readFixtureRows(provider, scope), notices: [] }
        : await readSourceRows({ provider, scope });
      const rows = sourceResult.items;
      const previewId = `preview-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
      const preview = {
        protocol,
        protocolVersion,
        previewId,
        provider,
        scopeSummary: `${provider === "feishu" ? "飞书" : "Codex"} · ${scope}`,
        selectedCount: rows.length,
        items: rows,
        notices: sourceResult.notices,
        expiresAt,
      };
      prunePreviews();
      previews.set(previewId, preview);
      trimPreviewCache();
      sendJson(response, 200, preview);
    } catch (error) {
      sendJson(response, 400, {
        error: "INVALID_FIXTURE",
        message:
          error instanceof Error ? error.message : "演示导出文件无法读取。",
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/v1/import/confirm") {
    try {
      const input = await readJson(request);
      prunePreviews();
      const preview = previews.get(input.previewId);
      const selectedExternalIds = Array.isArray(input.selectedExternalIds)
        ? input.selectedExternalIds.filter((item) => typeof item === "string")
        : [];
      if (!preview || new Date(preview.expiresAt).getTime() < Date.now()) {
        sendJson(response, 410, {
          error: "PREVIEW_EXPIRED",
          message: "这份导入预览已过期，请重新请求。",
        });
        return;
      }
      const selected =
        selectedExternalIds.length === 0
          ? preview.items
          : preview.items.filter((item) =>
              selectedExternalIds.includes(item.externalId),
            );
      if (selected.length === 0) {
        sendJson(response, 400, {
          error: "NOTHING_SELECTED",
          message: "至少选择一条预览材料。",
        });
        return;
      }
      sendJson(response, 200, {
        protocol,
        protocolVersion,
        previewId: preview.previewId,
        status: "confirmed",
        selectedCount: selected.length,
      });
    } catch (error) {
      sendJson(response, 400, {
        error: "INVALID_CONFIRMATION",
        message:
          error instanceof Error ? error.message : "导入确认请求无法解析。",
      });
    }
    return;
  }

  sendJson(response, 404, { error: "NOT_FOUND" });
});

server.listen(port, host, () => {
  console.log(`Trace 本地伴侣已启动：http://${host}:${port}`);
  console.log(
    fixtureConfigured()
      ? "已启用显式本地演示导出文件预览；不保存任何凭证。"
      : "已启用本机只读来源检测；只读取配置的 Codex 会话和飞书导出目录。",
  );
});

function shutdown() {
  server.close(() => process.exit(0));
}

function prunePreviews(now = Date.now()) {
  for (const [previewId, preview] of previews) {
    if (new Date(preview.expiresAt).getTime() < now) previews.delete(previewId);
  }
}

function trimPreviewCache() {
  while (previews.size > MAX_ACTIVE_PREVIEWS) {
    const oldestId = previews.keys().next().value;
    if (typeof oldestId !== "string") return;
    previews.delete(oldestId);
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length > 100_000) throw new Error("请求体过大。 ");
  const value = JSON.parse(raw);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("请求体必须是 JSON 对象。 ");
  }
  return value;
}

async function readFixtureRows(provider, scope) {
  const raw = fixturePath()
    ? await fs.readFile(fixturePath(), "utf8")
    : process.env.TRACE_COMPANION_FIXTURE_JSON;
  return parseFixtureRows(raw, { provider, scope });
}
