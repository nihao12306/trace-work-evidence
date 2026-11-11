const MAX_ITEMS = 200;

/**
 * Parse a user-selected local export for the explicit companion provider.
 * Rows without provider metadata remain compatible with older single-source
 * exports and are treated as belonging to the provider the user selected.
 */
export function parseFixtureRows(raw, { provider, scope }) {
  if (typeof raw !== "string" || raw.length === 0) {
    throw new Error("没有找到演示导出文件。 ");
  }
  const parsed = JSON.parse(raw);
  const rows = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw new Error("演示导出文件需要是非空数组，或包含 items 数组。 ");
  }
  if (rows.length > MAX_ITEMS) {
    throw new Error(`单次预览最多 ${MAX_ITEMS} 条材料。`);
  }

  const normalized = rows.map((row, index) => normalizeRow(row, index));
  const providerRows = normalized.filter(
    (row) => row.provider === undefined || row.provider === provider,
  );
  if (providerRows.length === 0) {
    throw new Error(
      `导出文件中没有标记为${provider === "feishu" ? "飞书" : "Codex"}的材料。`,
    );
  }

  const scopeTerm = scope.trim().toLocaleLowerCase();
  const scopedRows = providerRows.filter((row) => {
    if (!row.scope || !scopeTerm) return true;
    const rowScope = row.scope.toLocaleLowerCase();
    return rowScope.includes(scopeTerm) || scopeTerm.includes(rowScope);
  });
  if (scopedRows.length === 0) {
    throw new Error("没有找到符合本次范围的材料；请缩小或改写范围后重试。 ");
  }

  return scopedRows.map(({ provider: _provider, scope: _scope, ...item }) => {
    void _provider;
    void _scope;
    return item;
  });
}

function normalizeRow(row, index) {
  if (!row || typeof row !== "object" || Array.isArray(row)) {
    throw new Error(`第 ${index + 1} 条材料格式无效。`);
  }
  const provider = normalizeProvider(row.provider, row.locator);
  const externalId = String(
    row.externalId ?? row.id ?? `row-${index + 1}`,
  ).trim();
  const text = String(row.text ?? row.content ?? "").trim();
  const title = String(row.title ?? row.name ?? externalId).trim();
  const occurredOn = String(row.occurredOn ?? row.date ?? "").trim();
  const scope = typeof row.scope === "string" ? row.scope.trim() : undefined;
  if (
    !externalId ||
    !title ||
    !text ||
    !/^\d{4}-\d{2}-\d{2}$/.test(occurredOn)
  ) {
    throw new Error(
      `第 ${index + 1} 条材料缺少 externalId、日期、标题或正文。`,
    );
  }
  return {
    externalId,
    occurredOn,
    title,
    text,
    ...(row.locator ? { locator: String(row.locator) } : {}),
    ...(provider ? { provider } : {}),
    ...(scope ? { scope } : {}),
  };
}

function normalizeProvider(value, locator) {
  if (value === "feishu" || value === "codex") return value;
  if (value !== undefined && value !== null && value !== "") {
    throw new Error("材料 provider 必须是 feishu 或 codex。 ");
  }
  const locatorText = typeof locator === "string" ? locator : "";
  if (/codex/i.test(locatorText)) return "codex";
  if (/feishu/i.test(locatorText)) return "feishu";
  return undefined;
}
