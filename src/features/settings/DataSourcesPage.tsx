import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";
import type { LocalFileImportPreview } from "../../application/localImport";
import type { TraceBackup } from "../../domain/model";
import type { WorkbenchSnapshot } from "../../application/ports/workbenchRepository";
import {
  CompanionProtocolError,
  CompanionUnavailableError,
  localCompanionClient,
} from "../../infrastructure/companion/localCompanionClient";
import type {
  CompanionHealth,
  CompanionImportPreview,
} from "../../application/ports/localCompanion";

type CompanionState =
  "unknown" | "checking" | "ready" | "offline" | "incompatible";

interface ImportBatchImpact {
  recordCount: number;
  removableCount: number;
  preservedCount: number;
  references: string[];
}

export function DataSourcesPage() {
  const workspace = useWorkspace();
  const [companionState, setCompanionState] =
    useState<CompanionState>("unknown");
  const [health, setHealth] = useState<CompanionHealth>();
  const [message, setMessage] = useState<string>();
  const [companionPreview, setCompanionPreview] =
    useState<CompanionImportPreview>();
  const [companionProvider, setCompanionProvider] = useState<
    "feishu" | "codex"
  >("feishu");
  const [companionScope, setCompanionScope] = useState("");
  const [companionSelectedIds, setCompanionSelectedIds] = useState<string[]>(
    [],
  );
  const [companionBusy, setCompanionBusy] = useState(false);
  const [companionImportedRecordIds, setCompanionImportedRecordIds] = useState<
    string[]
  >([]);
  const [companionSummarizing, setCompanionSummarizing] = useState(false);
  const [filePreview, setFilePreview] = useState<LocalFileImportPreview>();
  const [fileBusy, setFileBusy] = useState(false);
  const [dataBusy, setDataBusy] = useState<
    "export" | "restore" | "clear" | "demo" | "remove"
  >();
  const [dataMessage, setDataMessage] = useState<string>();
  const [dataError, setDataError] = useState<string>();
  const [aiModeDraft, setAiModeDraft] = useState<
    "off" | "demo" | "custom_endpoint"
  >(workspace.snapshot?.settings?.aiMode ?? "off");
  const [aiEndpointDraft, setAiEndpointDraft] = useState(
    workspace.snapshot?.settings?.aiEndpointConfig?.endpoint ?? "",
  );
  const [aiSettingsBusy, setAiSettingsBusy] = useState(false);
  const [aiSettingsMessage, setAiSettingsMessage] = useState<string>();
  const [aiSettingsError, setAiSettingsError] = useState<string>();
  const [timezoneDraft, setTimezoneDraft] = useState(
    workspace.snapshot?.settings?.timezone ?? "Asia/Shanghai",
  );
  const [weekStartsOnDraft, setWeekStartsOnDraft] = useState<0 | 1>(
    workspace.snapshot?.settings?.weekStartsOn ?? 1,
  );
  const [preferencesBusy, setPreferencesBusy] = useState(false);
  const [preferencesMessage, setPreferencesMessage] = useState<string>();
  const [preferencesError, setPreferencesError] = useState<string>();

  useEffect(() => {
    const settings = workspace.snapshot?.settings;
    if (!settings) return;
    const syncId = window.setTimeout(() => {
      setAiModeDraft(settings.aiMode);
      setAiEndpointDraft(settings.aiEndpointConfig?.endpoint ?? "");
      setTimezoneDraft(settings.timezone);
      setWeekStartsOnDraft(settings.weekStartsOn);
    }, 0);
    return () => window.clearTimeout(syncId);
  }, [workspace.snapshot?.settings]);

  const latestImports = useMemo(
    () =>
      [...(workspace.snapshot?.importBatches ?? [])].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      ),
    [workspace.snapshot?.importBatches],
  );
  const importImpacts = useMemo(() => {
    const impacts = new Map<string, ImportBatchImpact>();
    for (const batch of latestImports) {
      impacts.set(
        batch.id,
        describeImportBatchImpact(batch.id, workspace.snapshot),
      );
    }
    return impacts;
  }, [latestImports, workspace.snapshot]);

  async function checkCompanion() {
    setCompanionState("checking");
    setMessage(undefined);
    try {
      const nextHealth = await localCompanionClient.checkHealth();
      setHealth(nextHealth);
      setCompanionState("ready");
      setMessage(describeCompanionHealth(nextHealth));
    } catch (error) {
      setHealth(undefined);
      if (error instanceof CompanionProtocolError) {
        setCompanionState("incompatible");
        setMessage(error.message);
      } else if (error instanceof CompanionUnavailableError) {
        setCompanionState("offline");
        setMessage("没有检测到本地伴侣。你仍然可以继续手动记录和导入文件。");
      } else {
        setCompanionState("offline");
        setMessage("检查本地伴侣时发生未知错误。核心记录流程不受影响。");
      }
    }
  }

  async function requestCompanionPreview() {
    const scope = companionScope.trim();
    if (!scope) {
      setMessage("请先写清楚本次要读取的文档、任务或时间范围。 ");
      return;
    }
    setCompanionBusy(true);
    setMessage(undefined);
    try {
      const preview = await localCompanionClient.requestPreview({
        provider: companionProvider,
        scope,
      });
      setCompanionPreview(preview);
      setCompanionSelectedIds(preview.items.map((item) => item.externalId));
      setMessage("本机伴侣已返回预览；确认前不会写入工作册。 ");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "无法取得本机伴侣预览，工作册没有被修改。",
      );
    } finally {
      setCompanionBusy(false);
    }
  }

  async function confirmCompanionPreview() {
    if (!companionPreview || companionSelectedIds.length === 0) return;
    if (
      !window.confirm(
        `确认导入 ${companionSelectedIds.length} 条本机伴侣材料吗？它们会先作为原始记录保存，不会自动成为证据。`,
      )
    ) {
      return;
    }
    setCompanionBusy(true);
    setDataError(undefined);
    try {
      await localCompanionClient.confirmImport({
        previewId: companionPreview.previewId,
        selectedExternalIds: companionSelectedIds,
      });
      const selected = companionPreview.items.filter((item) =>
        companionSelectedIds.includes(item.externalId),
      );
      const materialized = await workspace.confirmCompanionImport({
        preview: companionPreview,
        items: selected,
      });
      setCompanionPreview(undefined);
      setCompanionSelectedIds([]);
      setCompanionImportedRecordIds(
        materialized.records.map((record) => record.id),
      );
      setMessage(
        `已确认并导入 ${materialized.records.length} 条${providerLabel(companionPreview.provider)}原始材料；来源范围和批次已记录。`,
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "导入确认失败，本地工作册没有被修改。",
      );
    } finally {
      setCompanionBusy(false);
    }
  }

  async function summarizeCompanionImport() {
    if (companionImportedRecordIds.length === 0) return;
    setCompanionSummarizing(true);
    setDataError(undefined);
    try {
      let candidateCount = 0;
      for (const recordId of companionImportedRecordIds) {
        candidateCount += await workspace.createTextCandidates(recordId);
      }
      setCompanionImportedRecordIds([]);
      setMessage(
        candidateCount > 0
          ? `已生成 ${candidateCount} 条保守证据草稿。它们仍待你确认，不会自动成为事实；请到记录页逐条检查。`
          : "这批材料暂时没有识别出可靠的证据候选，原始记录仍已保留。",
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "证据草稿生成失败，原始记录仍然保留。",
      );
    } finally {
      setCompanionSummarizing(false);
    }
  }

  async function handleFileSelected(file: File | undefined) {
    if (!file) return;
    setFileBusy(true);
    setFilePreview(undefined);
    setDataError(undefined);
    setDataMessage(undefined);
    try {
      const preview = workspace.previewLocalFile({
        previewId: crypto.randomUUID(),
        fileName: file.name,
        content: await file.text(),
        importDate: workspaceToday(workspace.snapshot?.settings?.timezone),
      });
      setFilePreview(preview);
      setDataMessage("预览已生成。确认前不会写入任何本地记录。");
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "文件预览失败，请换一个文件再试。 ",
      );
    } finally {
      setFileBusy(false);
    }
  }

  async function confirmFileImport() {
    if (!filePreview) return;
    if (
      !window.confirm(
        `确认导入 ${filePreview.selectedCount} 条记录吗？导入后它们会以“原始记录”进入工作册，不会自动生成证据。`,
      )
    ) {
      return;
    }
    setFileBusy(true);
    setDataError(undefined);
    try {
      await workspace.confirmLocalFileImport(filePreview);
      setFilePreview(undefined);
      setDataMessage(
        `已导入 ${filePreview.selectedCount} 条原始记录。请逐条整理证据。`,
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "导入失败，本地工作册没有被修改。 ",
      );
    } finally {
      setFileBusy(false);
    }
  }

  async function handleBackupExport() {
    setDataBusy("export");
    setDataError(undefined);
    setDataMessage(undefined);
    try {
      const backup = await workspace.exportBackup();
      downloadJson(
        backup,
        `trace-backup-${new Date().toISOString().slice(0, 10)}.json`,
      );
      setDataMessage("备份已下载。请把它保存在不会公开上传的位置。");
    } catch (error) {
      setDataError(error instanceof Error ? error.message : "备份导出失败。");
    } finally {
      setDataBusy(undefined);
    }
  }

  async function handleBackupSelected(file: File | undefined) {
    if (!file) return;
    setDataBusy("restore");
    setDataError(undefined);
    setDataMessage(undefined);
    try {
      const backup = JSON.parse(await file.text()) as unknown;
      if (
        !window.confirm(
          "恢复备份会替换当前工作册。建议先下载当前备份；确认继续吗？",
        )
      ) {
        return;
      }
      await workspace.restoreBackup(backup);
      setDataMessage("备份已恢复，当前页面已重新读取本地工作册。");
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "备份文件无法恢复；原有数据保持不变。",
      );
    } finally {
      setDataBusy(undefined);
    }
  }

  async function handleClearWorkspace() {
    if (
      !window.confirm(
        "清空会删除这台浏览器中的全部记录、证据、周报、案例和能力主张，且无法撤销。请确认你已经备份。",
      )
    ) {
      return;
    }
    setDataBusy("clear");
    setDataError(undefined);
    setDataMessage(undefined);
    try {
      await workspace.clearWorkspace();
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "清空失败，本地工作册保持不变。",
      );
    } finally {
      setDataBusy(undefined);
    }
  }

  async function handleLoadDemo() {
    if (
      !window.confirm(
        "载入演示数据会替换当前工作册。建议先下载当前备份；确认继续吗？",
      )
    ) {
      return;
    }
    setDataBusy("demo");
    setDataError(undefined);
    setDataMessage(undefined);
    try {
      await workspace.initializeDemo();
      setDataMessage(
        "演示工作册已载入。它只包含虚构内容，可安全用于公开演示。",
      );
    } catch (error) {
      setDataError(
        error instanceof Error ? error.message : "演示数据载入失败。",
      );
    } finally {
      setDataBusy(undefined);
    }
  }

  async function handleAiSettingsSave() {
    setAiSettingsBusy(true);
    setAiSettingsMessage(undefined);
    setAiSettingsError(undefined);
    try {
      await workspace.updateAiSettings({
        mode: aiModeDraft,
        ...(aiModeDraft === "custom_endpoint"
          ? { endpoint: aiEndpointDraft }
          : {}),
      });
      setAiSettingsMessage(
        aiModeDraft === "off"
          ? "AI 已关闭；记录、证据、周报和导出仍可手动完成。"
          : aiModeDraft === "demo"
            ? "已启用无网络演示 AI；所有输出仍需你确认。"
            : "已保存自定义端点；每次发送前会先展示本次将发送的记录范围。",
      );
    } catch (error) {
      setAiSettingsError(
        error instanceof Error ? error.message : "AI 设置保存失败。",
      );
    } finally {
      setAiSettingsBusy(false);
    }
  }

  async function handlePreferencesSave() {
    setPreferencesBusy(true);
    setPreferencesMessage(undefined);
    setPreferencesError(undefined);
    try {
      await workspace.updateWorkspacePreferences({
        timezone: timezoneDraft,
        weekStartsOn: weekStartsOnDraft,
      });
      setPreferencesMessage(
        "时间设置已保存；本周、新记录和项目日期将使用同一规则。",
      );
    } catch (error) {
      setPreferencesError(
        error instanceof Error ? error.message : "时间设置保存失败。",
      );
    } finally {
      setPreferencesBusy(false);
    }
  }

  async function handleRemoveImportedBatch(
    batchId: string,
    scope: string,
    impact: ImportBatchImpact,
  ) {
    if (impact.removableCount === 0) return;
    const referenceSummary =
      impact.references.length > 0
        ? `\n\n以下引用会让 ${impact.preservedCount} 条记录保留：\n${impact.references
            .slice(0, 6)
            .map((reference) => `· ${reference}`)
            .join("\n")}${
            impact.references.length > 6
              ? `\n· 以及另外 ${impact.references.length - 6} 个引用`
              : ""
          }`
        : "";
    if (
      !window.confirm(
        `确认移除“${scope}”这批本地导入副本吗？\n\n可移除 ${impact.removableCount} 条；已被证据链引用的 ${impact.preservedCount} 条不会被删除。${referenceSummary}`,
      )
    ) {
      return;
    }
    setDataBusy("remove");
    setDataError(undefined);
    setDataMessage(undefined);
    try {
      const result = await workspace.removeImportedBatch(batchId);
      setDataMessage(
        result.preservedRecordIds.length > 0
          ? `已移除 ${result.removedRecordIds.length} 条未被引用的副本；${result.preservedRecordIds.length} 条因已有证据引用而保留。`
          : `已移除 ${result.removedRecordIds.length} 条本地导入副本。`,
      );
    } catch (error) {
      setDataError(
        error instanceof Error
          ? error.message
          : "移除导入副本失败，原有数据保持不变。",
      );
    } finally {
      setDataBusy(undefined);
    }
  }

  return (
    <section className="page source-center-page">
      <header className="page-header source-center-header">
        <div>
          <p className="eyebrow">数据边界</p>
          <h1>数据来源中心</h1>
          <p>
            Trace
            默认不连接任何外部来源。你可以只用手动记录和文件导入；配置本机伴侣后，
            Trace 才会按你选择的范围读取 Codex 会话和飞书本地导出材料。
          </p>
        </div>
        <div className="source-center-note">
          <span className="source-status-mark" aria-hidden="true" />
          <span>当前工作册仍只在这台浏览器中保存</span>
        </div>
      </header>

      <section
        className="boundary-box source-boundary-box"
        aria-labelledby="boundary-title"
      >
        <strong id="boundary-title">默认边界</strong>
        <ul className="boundary-list">
          <li>
            <strong>读取范围：</strong>没有明确选择时，不访问飞书、Codex
            历史或本机其他工作资料。
          </li>
          <li>
            <strong>存储位置：</strong>手动记录和确认导入的材料保存在当前浏览器
            IndexedDB，不上传 Trace 作者的服务器。
          </li>
          <li>
            <strong>AI 发送：</strong>文件预览、备份和恢复不调用 AI；自定义 AI
            请求都必须由你主动触发并先说明范围。
          </li>
          <li>
            <strong>撤销方式：</strong>
            停止本地伴侣即可停止读取。已导入材料可在下方按批次移除；被证据引用的原文会保留。当前没有在线授权令牌。
          </li>
          <li>
            <strong>替代路径：</strong>
            伴侣未运行时，手动记录、文件导入、证据整理、周报和导出仍可使用。
          </li>
        </ul>
      </section>

      <section className="source-section" aria-labelledby="time-settings-title">
        <div className="section-kicker">
          <p className="eyebrow">工作册规则</p>
          <h2 id="time-settings-title">时间与自然周</h2>
        </div>
        <div className="ai-settings-panel">
          <div>
            <h3>让“今天”和“本周”保持一致</h3>
            <p>
              日期按工作册时区计算。修改规则不会静默改写已存在的记录或已经定稿的周报。
            </p>
          </div>
          <div className="ai-settings-form">
            <label className="field">
              <span>时区</span>
              <input
                value={timezoneDraft}
                onChange={(event) => setTimezoneDraft(event.target.value)}
                placeholder="Asia/Shanghai"
                disabled={preferencesBusy}
              />
              <small>使用 IANA 时区名称，例如 Asia/Shanghai。</small>
            </label>
            <label className="field">
              <span>每周从哪一天开始</span>
              <select
                value={weekStartsOnDraft}
                onChange={(event) =>
                  setWeekStartsOnDraft(Number(event.target.value) as 0 | 1)
                }
                disabled={preferencesBusy}
              >
                <option value={1}>周一</option>
                <option value={0}>周日</option>
              </select>
            </label>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => void handlePreferencesSave()}
              disabled={preferencesBusy}
            >
              {preferencesBusy ? "保存中…" : "保存时间设置"}
            </button>
            {preferencesMessage ? (
              <p className="data-management-message" role="status">
                {preferencesMessage}
              </p>
            ) : null}
            {preferencesError ? (
              <p className="data-management-error" role="alert">
                {preferencesError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="source-section" aria-labelledby="manual-source-title">
        <div className="section-kicker">
          <p className="eyebrow">现在可用</p>
          <h2 id="manual-source-title">手动与文件</h2>
        </div>
        <div className="source-card source-card-ready">
          <div>
            <span className="source-card-label">默认开启</span>
            <h3>手动记录</h3>
            <p>你主动写下的记录会保存在当前浏览器，不经过外部服务。</p>
          </div>
          <span className="source-pill source-pill-ready">可用</span>
        </div>
        <div className="source-card source-card-ready source-card-file">
          <div>
            <span className="source-card-label">按次选择</span>
            <h3>文件导入</h3>
            <p>
              支持 Markdown、JSON 和文本文件。你也可以把 Codex
              主动导出的内容作为文件带入；先预览，再确认写入，不会扫描历史目录或自动生成证据。
            </p>
            <label className="button button-secondary source-file-picker">
              {fileBusy ? "读取中…" : "选择文件并预览"}
              <input
                type="file"
                accept=".md,.markdown,.json,.txt,text/markdown,application/json,text/plain"
                disabled={fileBusy}
                onChange={(event) => {
                  void handleFileSelected(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
          </div>
          <span className="source-pill source-pill-ready">可用</span>
        </div>
      </section>

      {filePreview ? (
        <section
          className="source-section source-import-preview"
          aria-labelledby="import-preview-title"
        >
          <div className="section-kicker">
            <p className="eyebrow">尚未写入</p>
            <h2 id="import-preview-title">导入预览</h2>
          </div>
          <div className="import-preview-panel">
            <div className="import-preview-summary">
              <div>
                <strong>{filePreview.fileName}</strong>
                <span>{filePreview.scopeSummary}</span>
              </div>
              <span className="source-pill source-pill-checking">
                待确认 · {filePreview.selectedCount} 条
              </span>
            </div>
            <ul className="import-preview-list">
              {filePreview.items.map((item) => (
                <li key={item.externalId}>
                  <time>{item.occurredOn}</time>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.text}</p>
                  </div>
                  {item.dateSource === "import_date" ? (
                    <span className="source-pill source-pill-unknown">
                      日期使用导入日
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
            <div className="import-preview-actions">
              <button
                className="button button-primary"
                type="button"
                disabled={fileBusy}
                onClick={() => void confirmFileImport()}
              >
                {fileBusy ? "写入中…" : "确认导入"}
              </button>
              <button
                className="button button-plain"
                type="button"
                disabled={fileBusy}
                onClick={() => setFilePreview(undefined)}
              >
                取消预览
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <section
        className="source-section source-data-management"
        aria-labelledby="data-management-title"
      >
        <div className="section-kicker">
          <p className="eyebrow">数据主权</p>
          <h2 id="data-management-title">备份、恢复与清空</h2>
        </div>
        <div className="data-management-panel">
          <p>
            备份是可读的
            JSON，包含当前工作册的完整记录、引用和整理关系；不会包含 API Key
            或密码。
          </p>
          <div className="data-management-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={dataBusy !== undefined || fileBusy}
              onClick={() => void handleBackupExport()}
            >
              {dataBusy === "export" ? "准备备份…" : "下载本地备份"}
            </button>
            <label className="button button-secondary source-file-picker">
              {dataBusy === "restore" ? "恢复中…" : "选择备份并恢复"}
              <input
                type="file"
                accept="application/json,.json"
                disabled={dataBusy !== undefined || fileBusy}
                onChange={(event) => {
                  void handleBackupSelected(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
            </label>
            <button
              className="button button-plain"
              type="button"
              disabled={dataBusy !== undefined || fileBusy}
              onClick={() => void handleLoadDemo()}
            >
              {dataBusy === "demo" ? "载入中…" : "重新载入演示数据"}
            </button>
            <button
              className="button button-danger-plain"
              type="button"
              disabled={dataBusy !== undefined || fileBusy}
              onClick={() => void handleClearWorkspace()}
            >
              {dataBusy === "clear" ? "清空中…" : "清空本地工作册"}
            </button>
          </div>
          <p className="data-management-note">
            恢复会替换当前工作册；清空后会回到开始页面。两项操作都需要再次确认。
          </p>
          {dataMessage ? (
            <p className="data-management-message" role="status">
              {dataMessage}
            </p>
          ) : null}
          {dataError ? (
            <p className="data-management-error" role="alert">
              {dataError}
            </p>
          ) : null}
        </div>
      </section>

      <section className="source-section" aria-labelledby="companion-title">
        <div className="section-kicker">
          <p className="eyebrow">可选增强</p>
          <h2 id="companion-title">本地伴侣</h2>
        </div>
        <div className="companion-panel">
          <div className="companion-panel-copy">
            <span className={`source-pill source-pill-${companionState}`}>
              {companionLabel(companionState)}
            </span>
            <h3>只在你的电脑上运行</h3>
            <p>
              本地伴侣是一个可选的无界面中转进程。它不等于 OAuth
              后端，也不会把资料发送到 Trace
              作者的服务器。现在它可以只读读取本机 Codex
              的会话文件，以及你明确配置的飞书导出/同步目录；读取结果先预览，只有确认后才写入工作册。
            </p>
            {health ? (
              <dl className="companion-details">
                <div>
                  <dt>协议</dt>
                  <dd>v{health.protocolVersion}</dd>
                </div>
                <div>
                  <dt>伴侣版本</dt>
                  <dd>{health.companionVersion}</dd>
                </div>
                <div>
                  <dt>当前能力</dt>
                  <dd>
                    {health.capabilities.includes("preview_import")
                      ? "健康检查 · 预览 · 确认"
                      : "无凭证健康检查"}
                  </dd>
                </div>
              </dl>
            ) : null}
            {health?.sources ? (
              <div
                className="companion-source-status"
                aria-label="来源读取状态"
              >
                <div>
                  <span>Codex</span>
                  <strong>
                    {sourceStatusLabel(health.sources.codex.status)}
                  </strong>
                  <small>{health.sources.codex.label}</small>
                </div>
                <div>
                  <span>飞书</span>
                  <strong>
                    {sourceStatusLabel(health.sources.feishu.status)}
                  </strong>
                  <small>{health.sources.feishu.label}</small>
                </div>
              </div>
            ) : null}
            {message ? (
              <p className="companion-message" role="status">
                {message}
              </p>
            ) : null}
            {health?.capabilities.includes("preview_import") ? (
              <div className="companion-import-tools">
                <div className="companion-import-fields">
                  <label className="field">
                    <span>来源</span>
                    <select
                      value={companionProvider}
                      onChange={(event) =>
                        setCompanionProvider(
                          event.target.value as "feishu" | "codex",
                        )
                      }
                      disabled={companionBusy}
                    >
                      <option value="feishu">飞书（只读预览）</option>
                      <option value="codex">Codex 会话（只读预览）</option>
                    </select>
                  </label>
                  <label className="field companion-scope-field">
                    <span>本次范围</span>
                    <input
                      value={companionScope}
                      onChange={(event) =>
                        setCompanionScope(event.target.value)
                      }
                      placeholder="例如：最近7天 / 项目关键词 / 全部"
                      disabled={companionBusy}
                    />
                  </label>
                </div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => void requestCompanionPreview()}
                  disabled={companionBusy}
                >
                  {companionBusy ? "请求中…" : "请求本机预览"}
                </button>
              </div>
            ) : (
              <p className="companion-message">
                当前伴侣没有可读取的来源。Codex 默认读取
                ~/.codex/sessions；飞书需要设置 TRACE_FEISHU_EXPORT_DIR
                指向本地导出或同步目录。配置后重新检查伴侣。
              </p>
            )}
            {companionPreview ? (
              <div className="companion-preview" aria-label="本机伴侣导入预览">
                <div className="companion-preview-header">
                  <strong>{companionPreview.scopeSummary}</strong>
                  <span>确认前不写入 · {companionSelectedIds.length} 条</span>
                </div>
                {companionPreview.notices?.length ? (
                  <div className="inline-alert" role="status">
                    <span>{companionPreview.notices.join(" ")}</span>
                  </div>
                ) : null}
                <div className="companion-preview-list">
                  {companionPreview.items.map((item) => (
                    <label
                      key={item.externalId}
                      className="companion-preview-item"
                    >
                      <input
                        type="checkbox"
                        checked={companionSelectedIds.includes(item.externalId)}
                        onChange={(event) =>
                          setCompanionSelectedIds((current) =>
                            event.target.checked
                              ? [...current, item.externalId]
                              : current.filter((id) => id !== item.externalId),
                          )
                        }
                        disabled={companionBusy}
                      />
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.occurredOn} · {item.text}
                        </small>
                        {item.truncated ? (
                          <em>内容较长，本次只导入前 16,000 字</em>
                        ) : null}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="companion-preview-actions">
                  <button
                    className="button button-primary button-small"
                    type="button"
                    onClick={() => void confirmCompanionPreview()}
                    disabled={
                      companionBusy || companionSelectedIds.length === 0
                    }
                  >
                    {companionBusy ? "确认中…" : "确认导入选中材料"}
                  </button>
                  <button
                    className="button button-plain button-small"
                    type="button"
                    onClick={() => {
                      setCompanionPreview(undefined);
                      setCompanionSelectedIds([]);
                    }}
                    disabled={companionBusy}
                  >
                    取消预览
                  </button>
                </div>
              </div>
            ) : null}
            {companionImportedRecordIds.length > 0 ? (
              <div className="companion-post-import" role="status">
                <div>
                  <strong>这批原始材料已经进入工作册</strong>
                  <p>
                    现在可以生成保守的证据草稿；草稿仍然带原文引用，必须由你确认后才会进入周报或案例。
                  </p>
                </div>
                <div className="companion-preview-actions">
                  <button
                    className="button button-primary button-small"
                    type="button"
                    onClick={() => void summarizeCompanionImport()}
                    disabled={companionSummarizing}
                  >
                    {companionSummarizing ? "整理中…" : "生成证据草稿"}
                  </button>
                  <button
                    className="button button-plain button-small"
                    type="button"
                    onClick={() => setCompanionImportedRecordIds([])}
                    disabled={companionSummarizing}
                  >
                    稍后再整理
                  </button>
                </div>
              </div>
            ) : null}
          </div>
          <div className="companion-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={companionState === "checking"}
              onClick={() => void checkCompanion()}
            >
              {companionState === "checking" ? "检查中…" : "检查本地伴侣"}
            </button>
            <p>伴侣未运行时，手动记录和文件导入不受影响。</p>
          </div>
        </div>
      </section>

      <section className="source-section" aria-labelledby="ai-boundary-title">
        <div className="section-kicker">
          <p className="eyebrow">可选配置</p>
          <h2 id="ai-boundary-title">AI 发送边界</h2>
        </div>
        <div className="ai-settings-panel">
          <div>
            <h3>先决定是否把资料交给模型</h3>
            <p>
              关闭 AI 时，Trace 不会发起模型请求。演示 AI
              完全无网络；自定义端点只会在你主动点击整理按钮并确认发送预览后使用。
            </p>
          </div>
          <div className="ai-settings-form">
            <label className="field">
              <span>AI 模式</span>
              <select
                value={aiModeDraft}
                onChange={(event) =>
                  setAiModeDraft(
                    event.target.value as "off" | "demo" | "custom_endpoint",
                  )
                }
                disabled={aiSettingsBusy}
              >
                <option value="off">关闭 AI</option>
                <option value="demo">演示 AI（无网络）</option>
                <option value="custom_endpoint">
                  自定义端点（我自己负责）
                </option>
              </select>
            </label>
            {aiModeDraft === "custom_endpoint" ? (
              <label className="field">
                <span>端点地址</span>
                <input
                  value={aiEndpointDraft}
                  onChange={(event) => setAiEndpointDraft(event.target.value)}
                  placeholder="例如：http://127.0.0.1:8787/trace"
                  inputMode="url"
                  disabled={aiSettingsBusy}
                />
                <small>Trace 不保存 API Key，也不会替端点管理凭证。</small>
              </label>
            ) : null}
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => void handleAiSettingsSave()}
              disabled={aiSettingsBusy}
            >
              {aiSettingsBusy ? "保存中…" : "保存 AI 设置"}
            </button>
            {aiSettingsMessage ? (
              <p className="data-management-message" role="status">
                {aiSettingsMessage}
              </p>
            ) : null}
            {aiSettingsError ? (
              <p className="data-management-error" role="alert">
                {aiSettingsError}
              </p>
            ) : null}
          </div>
        </div>
      </section>

      <section className="source-section" aria-labelledby="future-source-title">
        <div className="section-kicker">
          <p className="eyebrow">本地来源</p>
          <h2 id="future-source-title">外部来源</h2>
        </div>
        <div className="source-grid">
          <SourceCard
            label="本地伴侣 · 按范围"
            title="飞书"
            description="从 TRACE_FEISHU_EXPORT_DIR 指向的本地导出/同步目录读取；不登录在线账号。"
            status={health?.sources?.feishu.status}
          />
          <SourceCard
            label="本地伴侣 · 按范围"
            title="Codex 历史"
            description="默认读取 ~/.codex/sessions 和 archived_sessions，只提取用户消息与 Codex 最终消息。"
            status={health?.sources?.codex.status}
          />
        </div>
      </section>

      <section
        className="source-section source-import-history"
        aria-labelledby="import-history-title"
      >
        <div className="section-kicker">
          <p className="eyebrow">本地记录</p>
          <h2 id="import-history-title">导入批次</h2>
        </div>
        {latestImports.length === 0 ? (
          <div className="source-empty">
            还没有导入。手动记录仍然是最小、完整的起点。
          </div>
        ) : (
          <ul className="import-history-list">
            {latestImports.map((batch) => (
              <li key={batch.id}>
                {(() => {
                  const impact =
                    importImpacts.get(batch.id) ?? emptyImportBatchImpact();
                  return (
                    <>
                      <div>
                        <strong>{providerLabel(batch.provider)}</strong>
                        <span>{batch.scopeSummary}</span>
                      </div>
                      <div className="import-history-actions">
                        <span>
                          {batch.importedCount} 条已写入本地 · 可移除{" "}
                          {impact.removableCount} 条
                        </span>
                        {impact.references.length > 0 ? (
                          <details className="import-history-impact">
                            <summary>
                              删除前查看 {impact.references.length} 个引用
                            </summary>
                            <ul>
                              {impact.references.map((reference) => (
                                <li key={reference}>{reference}</li>
                              ))}
                            </ul>
                          </details>
                        ) : null}
                        <button
                          className="button button-danger-plain button-small"
                          type="button"
                          disabled={
                            dataBusy !== undefined ||
                            fileBusy ||
                            impact.recordCount === 0 ||
                            impact.removableCount === 0
                          }
                          title={
                            impact.recordCount === 0
                              ? "这批次没有找到仍在本地的记录。"
                              : impact.removableCount === 0
                                ? "这批记录都已被证据链引用，暂不允许删除。"
                                : undefined
                          }
                          onClick={() =>
                            void handleRemoveImportedBatch(
                              batch.id,
                              batch.scopeSummary,
                              impact,
                            )
                          }
                        >
                          {dataBusy === "remove"
                            ? "移除中…"
                            : impact.recordCount === 0
                              ? "无本地副本"
                              : impact.removableCount === 0
                                ? "已被引用"
                                : "移除本地副本"}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function SourceCard({
  label,
  title,
  description,
  status,
}: {
  label: string;
  title: string;
  description: string;
  status?: "ready" | "not_configured" | "unavailable" | undefined;
}) {
  const statusText =
    status === "ready"
      ? "可读取"
      : status === "not_configured"
        ? "未配置"
        : status === "unavailable"
          ? "不可用"
          : "未检查";
  return (
    <article className="source-card source-card-future">
      <div>
        <span className="source-card-label">{label}</span>
        <h3>{title}</h3>
        <p>{description}</p>
        <dl className="source-card-boundary">
          <div>
            <dt>连接</dt>
            <dd>{statusText}</dd>
          </div>
          <div>
            <dt>断开来源</dt>
            <dd>停止伴侣或移除本地路径</dd>
          </div>
          <div>
            <dt>撤销授权</dt>
            <dd>当前没有在线令牌</dd>
          </div>
        </dl>
      </div>
      <span
        className={`source-pill ${status === "ready" ? "source-pill-ready" : "source-pill-off"}`}
      >
        {statusText}
      </span>
    </article>
  );
}

function companionLabel(state: CompanionState): string {
  switch (state) {
    case "checking":
      return "检查中";
    case "ready":
      return "已握手";
    case "offline":
      return "未运行";
    case "incompatible":
      return "版本不兼容";
    default:
      return "未检查";
  }
}

function describeCompanionHealth(health: CompanionHealth): string {
  if (!health.sources) {
    return "握手成功。请先配置一个可读取的本地来源，再请求范围预览。";
  }
  return `握手成功。Codex：${sourceStatusLabel(health.sources.codex.status)}；飞书：${sourceStatusLabel(health.sources.feishu.status)}。预览前不会写入工作册。`;
}

function sourceStatusLabel(
  status: "ready" | "not_configured" | "unavailable",
): string {
  if (status === "ready") return "可读取";
  if (status === "not_configured") return "未配置";
  return "不可用";
}

function providerLabel(provider: "local_file" | "feishu" | "codex"): string {
  switch (provider) {
    case "local_file":
      return "文件导入";
    case "feishu":
      return "飞书";
    case "codex":
      return "Codex 任务";
  }
}

function emptyImportBatchImpact(): ImportBatchImpact {
  return {
    recordCount: 0,
    removableCount: 0,
    preservedCount: 0,
    references: [],
  };
}

function describeImportBatchImpact(
  batchId: string,
  data: WorkbenchSnapshot | undefined,
): ImportBatchImpact {
  if (!data) return emptyImportBatchImpact();

  const records = data.records.filter(
    (record) => record.sourceAttribution?.importBatchId === batchId,
  );
  const recordIds = new Set(records.map((record) => record.id));
  const revisions = data.revisions.filter((revision) =>
    recordIds.has(revision.recordId),
  );
  const revisionById = new Map(
    revisions.map((revision) => [revision.id, revision.recordId]),
  );
  const sourceCitations = data.citations.filter(
    (citation) =>
      citation.targetKind === "source_record_revision" &&
      revisionById.has(citation.targetId),
  );
  const citedRecordIds = new Set<string>();
  for (const citation of sourceCitations) {
    const recordId = revisionById.get(citation.targetId);
    if (recordId) citedRecordIds.add(recordId);
  }
  const citationIds = new Set(sourceCitations.map((citation) => citation.id));
  const evidenceItems = data.evidenceItems.filter((evidence) =>
    evidence.citationIds.some((citationId) => citationIds.has(citationId)),
  );
  const evidenceIds = new Set(evidenceItems.map((evidence) => evidence.id));
  const references = new Set<string>();

  for (const evidence of evidenceItems) {
    references.add(`证据：${clipImportReference(evidence.statement)}`);
  }

  for (const citation of sourceCitations) {
    if (citation.validity !== "valid") {
      references.add(
        `${citation.validity === "stale" ? "过期" : "缺失"}引用：${clipImportReference(citation.quoteSnapshot)}`,
      );
    }
  }

  for (const block of data.outputBlocks) {
    const usesSource = block.citationIds.some((citationId) =>
      citationIds.has(citationId),
    );
    const usesEvidence = block.citationIds.some((citationId) =>
      evidenceIds.has(citationId),
    );
    if (usesSource || usesEvidence) {
      references.add(
        `${outputSectionLabel(block.sectionKey)}：${clipImportReference(block.content)}`,
      );
    }
  }

  for (const caseStudy of data.caseStudies) {
    if (
      caseStudy.includedEvidenceIds.some((evidenceId) =>
        evidenceIds.has(evidenceId),
      )
    ) {
      references.add(`项目案例：${clipImportReference(caseStudy.title)}`);
    }
  }

  for (const claim of data.capabilityClaims) {
    const usesEvidence = [
      ...claim.behaviorEvidenceIds,
      ...claim.outcomeEvidenceIds,
      ...claim.feedbackEvidenceIds,
    ].some((evidenceId) => evidenceIds.has(evidenceId));
    if (usesEvidence) {
      references.add(`能力线索：${clipImportReference(claim.title)}`);
    }
  }

  return {
    recordCount: records.length,
    removableCount: Math.max(records.length - citedRecordIds.size, 0),
    preservedCount: citedRecordIds.size,
    references: [...references],
  };
}

function outputSectionLabel(sectionKey: string): string {
  const labels: Record<string, string> = {
    focus: "周报·重点工作",
    results: "周报·已产生结果",
    went_well: "周报·做得好的地方",
    problems: "周报·存在的问题",
    supported_causes: "周报·有证据支持的原因",
    inferred_causes: "周报·暂时推测的原因",
    next_validations: "周报·下周验证事项",
    personal_reflection: "周报·我的工作思考",
    background: "案例·背景",
    problem: "案例·问题",
    judgment: "案例·判断",
    action: "案例·行动",
    iteration: "案例·迭代",
    result: "案例·结果",
    capability: "案例·形成的能力",
  };
  return labels[sectionKey] ?? "已确认输出";
}

function clipImportReference(value: string, maxLength = 56): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength)}…`
    : normalized;
}

function downloadJson(value: TraceBackup, fileName: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function workspaceToday(timeZone = "Asia/Shanghai"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}
