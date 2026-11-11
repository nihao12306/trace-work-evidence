import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const MAX_ITEMS = 200;
const MAX_FILES = 500;
const MAX_FILE_BYTES = 8_000_000;
const MAX_TEXT_LENGTH = 16_000;

/**
 * Read-only local source adapters used by the companion process.
 *
 * The Codex adapter deliberately reads only session JSONL files. It never
 * opens auth.json, databases, logs, memories, or any other file under the
 * Codex home. Feishu is intentionally opt-in: the user must point the
 * companion at a local export/sync directory.
 */
export async function readSourceRows({ provider, scope, now = new Date() }) {
  if (provider === "codex") {
    return readCodexRows({ scope, now });
  }
  if (provider === "feishu") {
    return readFeishuRows({ scope, now });
  }
  throw new Error("来源必须是 feishu 或 codex。 ");
}

export async function getSourceStatus() {
  const codexHome = resolveCodexHome();
  const codexSessionRoots = codexRoots(codexHome);
  const codexReady = await anyDirectory(codexSessionRoots);
  const feishuRoot = configuredFeishuRoot();
  const feishuReady = feishuRoot
    ? (await isDirectory(feishuRoot)) &&
      (
        await collectFiles(feishuRoot, (file) =>
          [".json", ".md", ".markdown", ".txt"].includes(
            path.extname(file).toLowerCase(),
          ),
        )
      ).files.length > 0
    : false;

  return {
    codex: {
      status: codexReady ? "ready" : "unavailable",
      label: codexReady ? "本机 Codex 会话" : "未找到 Codex 会话目录",
    },
    feishu: {
      status: feishuReady ? "ready" : "not_configured",
      label: feishuReady ? "本地飞书导出目录" : "未配置飞书导出目录",
    },
  };
}

export function resolveCodexHome() {
  const configured = process.env.TRACE_CODEX_HOME?.trim();
  if (configured) return path.resolve(configured);
  const codexHome = process.env.CODEX_HOME?.trim();
  if (codexHome) return path.resolve(codexHome);
  return path.join(os.homedir(), ".codex");
}

export function configuredFeishuRoot() {
  const configured = process.env.TRACE_FEISHU_EXPORT_DIR?.trim();
  return configured ? path.resolve(configured) : "";
}

async function readCodexRows({ scope, now }) {
  const codexHome = resolveCodexHome();
  const roots = codexRoots(codexHome);
  const scan = await collectFiles(roots, (file) => file.endsWith(".jsonl"));
  const files = scan.files;
  if (files.length === 0) {
    throw new Error(
      `没有找到 Codex 会话文件。已检查 ${roots.map((root) => path.basename(root)).join("、")}；可通过 TRACE_CODEX_HOME 指定 Codex 目录。`,
    );
  }

  const titles = await readSessionTitles(codexHome);
  const dateBounds = scopeDateBounds(scope, now);
  const rows = [];
  for (const file of files) {
    const fileDate = normalizeDateFromPath(file);
    if (
      dateBounds &&
      fileDate &&
      (fileDate < dateBounds.start || fileDate > dateBounds.end)
    ) {
      continue;
    }
    const parsed = await parseCodexSession(file);
    if (!parsed.text) continue;
    const occurredOn =
      normalizeDate(parsed.firstTimestamp) ??
      normalizeDateFromPath(file) ??
      (await safeFileDate(file)) ??
      formatDate(now);
    const title =
      titles.get(parsed.sessionId) ??
      firstUsefulLine(parsed.userMessages[0]) ??
      `Codex 会话 · ${occurredOn}`;
    const row = {
      externalId: parsed.sessionId ?? path.basename(file, ".jsonl"),
      occurredOn,
      title: compactTitle(title),
      text: parsed.text,
      truncated: parsed.truncated,
      locator: `codex://session/${encodeURIComponent(parsed.sessionId ?? path.basename(file, ".jsonl"))}`,
    };
    if (matchesScope(row, scope, now)) rows.push(row);
    if (rows.length >= MAX_ITEMS) break;
  }

  if (rows.length === 0) {
    throw new Error(
      "没有找到符合本次 Codex 范围的会话。请改用日期或任务关键词。 ",
    );
  }
  return {
    items: rows,
    notices: [
      ...(scan.truncated
        ? [
            `会话文件超过 ${MAX_FILES} 个；本次优先扫描较新的目录，仍可能有材料未进入预览。`,
          ]
        : []),
      ...(rows.length >= MAX_ITEMS
        ? [
            `预览最多显示 ${MAX_ITEMS} 条材料；请缩小日期或关键词范围后再次读取。`,
          ]
        : []),
      ...(rows.some((row) => row.truncated)
        ? [
            `部分材料超过 ${MAX_TEXT_LENGTH.toLocaleString("zh-CN")} 字，预览与导入只保留前段并已逐条标记。`,
          ]
        : []),
    ],
  };
}

async function readFeishuRows({ scope, now }) {
  const root = configuredFeishuRoot();
  if (!root) {
    throw new Error(
      "还没有配置飞书本地导出目录。请设置 TRACE_FEISHU_EXPORT_DIR 后重启本地伴侣；Trace 不会直接读取飞书账号。",
    );
  }
  if (!(await isDirectory(root))) {
    throw new Error(
      "飞书导出目录不存在或不可读取，请检查 TRACE_FEISHU_EXPORT_DIR。 ",
    );
  }

  const scan = await collectFiles(root, (file) =>
    [".json", ".md", ".markdown", ".txt"].includes(
      path.extname(file).toLowerCase(),
    ),
  );
  const files = scan.files;
  if (files.length === 0) {
    throw new Error("飞书导出目录中没有 JSON、Markdown 或文本材料。 ");
  }

  const rows = [];
  for (const file of files) {
    const fileRows = await parseFeishuFile(file, root, now);
    for (const row of fileRows) {
      if (matchesScope(row, scope, now)) rows.push(row);
      if (rows.length >= MAX_ITEMS) break;
    }
    if (rows.length >= MAX_ITEMS) break;
  }

  if (rows.length === 0) {
    throw new Error(
      "没有找到符合本次飞书范围的材料。请改用文档标题、关键词或日期。 ",
    );
  }
  return {
    items: rows,
    notices: [
      ...(scan.truncated
        ? [
            `来源文件超过 ${MAX_FILES} 个；本次优先扫描较新的目录，仍可能有材料未进入预览。`,
          ]
        : []),
      ...(rows.length >= MAX_ITEMS
        ? [
            `预览最多显示 ${MAX_ITEMS} 条材料；请缩小日期或关键词范围后再次读取。`,
          ]
        : []),
      ...(rows.some((row) => row.truncated)
        ? [
            `部分材料超过 ${MAX_TEXT_LENGTH.toLocaleString("zh-CN")} 字，预览与导入只保留前段并已逐条标记。`,
          ]
        : []),
    ],
  };
}

function codexRoots(codexHome) {
  const configuredSessions = process.env.TRACE_CODEX_SESSIONS_DIR?.trim();
  if (configuredSessions) return [path.resolve(configuredSessions)];
  return [
    path.join(codexHome, "sessions"),
    path.join(codexHome, "archived_sessions"),
  ];
}

async function parseCodexSession(file) {
  const userMessages = [];
  const agentMessages = [];
  let sessionId;
  let firstTimestamp;

  const stream = createReadStream(file, { encoding: "utf8" });
  const lines = readline.createInterface({
    input: stream,
    crlfDelay: Infinity,
  });
  try {
    for await (const line of lines) {
      if (!line || line.length > 2_000_000) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (!firstTimestamp && typeof event.timestamp === "string") {
        firstTimestamp = event.timestamp;
      }
      const payload = event?.payload;
      if (!payload || typeof payload !== "object") continue;
      if (event.type === "session_meta") {
        const candidate = payload.session_id ?? payload.id;
        if (typeof candidate === "string" && candidate.trim())
          sessionId = candidate.trim();
      }
      if (event.type !== "event_msg") continue;
      if (
        payload.type === "user_message" &&
        typeof payload.message === "string"
      ) {
        pushMessage(userMessages, payload.message);
      }
      if (
        payload.type === "agent_message" &&
        typeof payload.message === "string"
      ) {
        pushMessage(agentMessages, payload.message);
      }
    }
  } finally {
    lines.close();
    stream.destroy();
  }

  const sections = [];
  const turns = Math.max(userMessages.length, agentMessages.length);
  for (let index = 0; index < turns; index += 1) {
    const user = userMessages[index];
    const agent = agentMessages[index];
    if (user) sections.push(`我的请求：${user}`);
    if (agent) sections.push(`Codex 产出：${agent}`);
  }
  const text = sections.join("\n\n").trim();
  return {
    sessionId,
    firstTimestamp,
    userMessages,
    text: text.slice(0, MAX_TEXT_LENGTH),
    truncated: text.length > MAX_TEXT_LENGTH,
  };
}

async function readSessionTitles(codexHome) {
  const indexPath = path.join(codexHome, "session_index.jsonl");
  const titles = new Map();
  let raw;
  try {
    raw = await fs.readFile(indexPath, "utf8");
  } catch {
    return titles;
  }
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const item = JSON.parse(line);
      if (
        typeof item?.id === "string" &&
        typeof item?.thread_name === "string" &&
        item.thread_name.trim()
      ) {
        titles.set(item.id, item.thread_name.trim());
      }
    } catch {
      // A malformed index line must not block the rest of the source.
    }
  }
  return titles;
}

async function parseFeishuFile(file, root, now) {
  const stat = await fs.stat(file);
  if (stat.size > MAX_FILE_BYTES) return [];
  const raw = (await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "").trim();
  if (!raw) return [];
  const relative = path.relative(root, file).replaceAll("\\", "/");
  const extension = path.extname(file).toLowerCase();
  const baseName = path.basename(file, extension).trim() || "飞书材料";
  const occurredOn =
    normalizeDateFromPath(file) ?? formatDate(stat.mtime ?? now);
  const rows = [];

  if (extension === ".json") {
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error(`飞书文件 ${relative} 不是有效 JSON。`);
    }
    const candidates = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.items)
        ? parsed.items
        : Array.isArray(parsed?.records)
          ? parsed.records
          : [parsed];
    candidates.forEach((candidate, index) => {
      const row = normalizeFeishuRow(candidate, {
        baseName,
        relative,
        occurredOn,
        index,
      });
      if (row) rows.push(row);
    });
    return rows;
  }

  rows.push({
    externalId: `feishu-${shortHash(relative)}`,
    occurredOn,
    title: extractHeading(raw) ?? baseName,
    text: raw.slice(0, MAX_TEXT_LENGTH),
    truncated: raw.length > MAX_TEXT_LENGTH,
    locator: `feishu://local/${encodeURIComponent(relative)}`,
  });
  return rows;
}

function normalizeFeishuRow(candidate, input) {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate))
    return undefined;
  const text = firstString(candidate, ["text", "content", "body", "markdown"]);
  if (!text) return undefined;
  const dateValue = firstString(candidate, [
    "occurredOn",
    "date",
    "createdAt",
    "updatedAt",
  ]);
  const occurredOn = normalizeDate(dateValue) ?? input.occurredOn;
  const title =
    firstString(candidate, ["title", "name", "subject"]) ?? input.baseName;
  const externalId =
    firstString(candidate, ["externalId", "id", "token"]) ??
    `feishu-${shortHash(`${input.relative}:${input.index}`)}`;
  const locator = firstString(candidate, ["locator", "url", "link"]);
  return {
    externalId,
    occurredOn,
    title: compactTitle(title),
    text: text.slice(0, MAX_TEXT_LENGTH),
    truncated: text.length > MAX_TEXT_LENGTH,
    locator: locator || `feishu://local/${encodeURIComponent(input.relative)}`,
  };
}

async function collectFiles(roots, predicate) {
  const queue = (Array.isArray(roots) ? roots : [roots]).map((root) =>
    path.resolve(root),
  );
  const files = [];
  let truncated = false;
  while (queue.length && files.length < MAX_FILES) {
    const current = queue.shift();
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((left, right) =>
      right.name.localeCompare(left.name, undefined, { numeric: true }),
    );
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const next = path.join(current, entry.name);
      if (entry.isDirectory()) queue.push(next);
      else if (entry.isFile() && predicate(next)) files.push(next);
      if (files.length >= MAX_FILES) break;
    }
  }
  if (queue.length > 0 || files.length >= MAX_FILES) truncated = true;
  return {
    files: files.sort((left, right) => right.localeCompare(left)),
    truncated,
  };
}

async function anyDirectory(roots) {
  for (const root of roots) {
    if (await isDirectory(root)) return true;
  }
  return false;
}

async function isDirectory(value) {
  try {
    return (await fs.stat(value)).isDirectory();
  } catch {
    return false;
  }
}

async function safeFileDate(file) {
  try {
    return formatDate((await fs.stat(file)).mtime);
  } catch {
    return undefined;
  }
}

function matchesScope(row, scope, now) {
  const value = String(scope ?? "").trim();
  if (!value || /^(all|全部|所有|不限)$/iu.test(value)) return true;
  const range = parseDateRange(value);
  if (range)
    return row.occurredOn >= range.start && row.occurredOn <= range.end;
  const recent = value.match(/^(?:最近|last\s*)(\d+)\s*(?:天|days?)$/iu);
  if (recent) {
    const days = Math.max(1, Number(recent[1]));
    const end = formatDate(now);
    const startDate = new Date(now.getTime() - (days - 1) * 86_400_000);
    return row.occurredOn >= formatDate(startDate) && row.occurredOn <= end;
  }
  const term = value.toLocaleLowerCase();
  return [row.title, row.text, row.occurredOn, row.externalId].some((part) =>
    part.toLocaleLowerCase().includes(term),
  );
}

function scopeDateBounds(scope, now) {
  const value = String(scope ?? "").trim();
  const range = parseDateRange(value);
  if (range) return range;
  const exact = normalizeDate(value);
  if (exact && value === exact) return { start: exact, end: exact };
  const recent = value.match(/^(?:最近|last\s*)(\d+)\s*(?:天|days?)$/iu);
  if (!recent) return undefined;
  const days = Math.max(1, Number(recent[1]));
  const end = formatDate(now);
  const startDate = new Date(now.getTime() - (days - 1) * 86_400_000);
  return { start: formatDate(startDate), end };
}

function parseDateRange(value) {
  const match = value.match(
    /(\d{4}-\d{2}-\d{2})\s*(?:\.\.|至|到|-)\s*(\d{4}-\d{2}-\d{2})/u,
  );
  if (!match) return undefined;
  const start = normalizeDate(match[1]);
  const end = normalizeDate(match[2]);
  return start && end ? { start, end } : undefined;
}

function normalizeDate(value) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (!match) return undefined;
  const date = new Date(`${match}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== match
    ? undefined
    : match;
}

function normalizeDateFromPath(value) {
  const direct = normalizeDate(value);
  if (direct) return direct;
  const match = value.match(/[\\/](\d{4})[\\/](\d{2})[\\/](\d{2})[\\/]/u);
  return match
    ? normalizeDate(`${match[1]}-${match[2]}-${match[3]}`)
    : undefined;
}

function formatDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "1970-01-01";
  return date.toISOString().slice(0, 10);
}

function firstString(value, keys) {
  for (const key of keys) {
    if (typeof value?.[key] === "string" && value[key].trim())
      return value[key].trim();
  }
  return undefined;
}

function firstUsefulLine(value) {
  if (!value) return undefined;
  return value
    .split(/\r?\n/)
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find((line) => line.length > 3);
}

function extractHeading(value) {
  return value.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
}

function compactTitle(value) {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > 100 ? `${normalized.slice(0, 97)}…` : normalized;
}

function pushMessage(target, value) {
  const text = value.replace(/\s+/gu, " ").trim();
  if (!text || text.length < 2) return;
  const previous = target[target.length - 1];
  if (previous === text) return;
  target.push(text.slice(0, MAX_TEXT_LENGTH));
}

function shortHash(value) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}
