type ErrorLike = {
  name?: unknown;
  message?: unknown;
  cause?: unknown;
};

/**
 * Turns browser/IndexedDB failures into instructions a person can act on.
 * The original error is intentionally kept as the cause by callers; this
 * helper only decides which safe, non-technical message belongs in the UI.
 */
export function describeStorageError(error: unknown): string | undefined {
  const signals = collectSignals(error);
  const text = signals.join(" ").toLowerCase();

  if (/quota|quotaexceeded|storage.*full|空间不足|超出.*配额/.test(text)) {
    return "本地存储空间不足：这次写入已停止。请先下载备份、清理无用浏览器数据后再重试。";
  }

  if (
    /versionerror|upgradeerror|openfailed|migration|迁移|版本升级|数据库打开失败/.test(
      text,
    )
  ) {
    return "本地数据库升级失败：现有数据没有被继续改写。请刷新页面重试；若仍失败，先保留备份并联系项目作者。";
  }

  if (
    /missingapi|indexeddb.*(?:unavailable|不可用)|not supported|securityerror|安全错误|浏览器不支持|浏览器.*禁止/.test(
      text,
    )
  ) {
    return "本地存储不可用：请使用支持 IndexedDB 的浏览器，并检查隐私模式或站点存储权限。当前编辑器中的文字不会被自动清空。";
  }

  if (
    /transaction|aborterror|constrainterror|dataerror|readonlyerror|事务|写入失败|操作已中止/.test(
      text,
    )
  ) {
    return "本地存储事务失败：这次写入已回滚。请稍后重试；当前编辑器中的未提交文字仍会保留。";
  }

  return undefined;
}

function collectSignals(error: unknown): string[] {
  const signals: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 4 && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) {
      signals.push(current.name, current.message);
      current = current.cause;
      continue;
    }
    if (typeof current === "object") {
      const candidate = current as ErrorLike;
      if (typeof candidate.name === "string") signals.push(candidate.name);
      if (typeof candidate.message === "string") {
        signals.push(candidate.message);
      }
      current = candidate.cause;
      continue;
    }
    signals.push(String(current));
    break;
  }

  return signals.filter(Boolean);
}
