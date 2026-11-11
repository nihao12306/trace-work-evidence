import { type FormEvent, useMemo, useState } from "react";
import { Link } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";
import type {
  CompanionImportPreview,
  CompanionPreviewItem,
} from "../../application/ports/localCompanion";
import { inferCareerDirections } from "../../domain/careerDirections";
import { extractTextEvidenceProposals } from "../../domain/textEvidence";
import {
  CompanionUnavailableError,
  localCompanionClient,
} from "../../infrastructure/companion/localCompanionClient";
import { buildCareerBriefMarkdown } from "../../infrastructure/export/careerBriefMarkdown";

const MAX_AUTO_SELECTED_ITEMS = 30;

const ANALYSIS_PROMPT = `请阅读我上传的 Trace 岗位方向分析包。不要把我填写的偏好当成能力证据：
1. 先总结 5—8 条有证据支持的工作成果；
2. 区分已证实能力、可能优势和证据缺口；
3. 先只根据经历推导 2—3 个我可能胜任的岗位方向，并逐条引用依据；
4. 再用我的偏好、约束和排除项筛选这些方向，比较能力迁移、风险和验证动作；
5. 只追问会实质改变建议的关键信息；
6. 不要编造成绩、行业经历或个人偏好。`;

export function CareerBriefPage() {
  const workspace = useWorkspace();
  const snapshot = workspace.snapshot;
  const saved = snapshot?.settings?.careerProfile;
  const [currentRole, setCurrentRole] = useState(saved?.currentRole ?? "");
  const [targetDirections, setTargetDirections] = useState(
    saved?.targetDirections ?? "",
  );
  const [preferredWork, setPreferredWork] = useState(
    saved?.preferredWork ?? "",
  );
  const [constraints, setConstraints] = useState(saved?.constraints ?? "");
  const [dealBreakers, setDealBreakers] = useState(saved?.dealBreakers ?? "");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [scanScope, setScanScope] = useState("最近365天");
  const [scanPreviews, setScanPreviews] = useState<CompanionImportPreview[]>(
    [],
  );
  const [selectedScanKeys, setSelectedScanKeys] = useState<string[]>([]);
  const [scanRecordIds, setScanRecordIds] = useState<string[]>([]);
  const [scanBusy, setScanBusy] = useState<
    "checking" | "importing" | undefined
  >();
  const [scanMessage, setScanMessage] = useState<string>();
  const [scanError, setScanError] = useState<string>();

  const confirmedEvidence = useMemo(
    () =>
      (snapshot?.evidenceItems ?? [])
        .filter((item) => item.reviewState === "confirmed")
        .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn)),
    [snapshot?.evidenceItems],
  );
  const outcomes = confirmedEvidence.filter(
    (item) => item.type === "result" || item.type === "feedback",
  );
  const finalizedCases = (snapshot?.caseStudies ?? []).filter(
    (item) => item.status === "finalized",
  );
  const confirmedClaims = (snapshot?.capabilityClaims ?? []).filter(
    (item) => item.reviewState === "confirmed",
  );
  const directionCandidates = useMemo(
    () =>
      inferCareerDirections({
        projects: snapshot?.projects ?? [],
        evidenceItems: snapshot?.evidenceItems ?? [],
        capabilityClaims: snapshot?.capabilityClaims ?? [],
      }),
    [snapshot?.capabilityClaims, snapshot?.evidenceItems, snapshot?.projects],
  );
  const projectById = new Map(
    (snapshot?.projects ?? []).map((project) => [project.id, project]),
  );
  const importedExternalIds = useMemo(
    () =>
      new Set(
        (snapshot?.records ?? [])
          .map((record) => record.sourceAttribution?.externalId)
          .filter((id): id is string => id !== undefined),
      ),
    [snapshot?.records],
  );
  const scannedItems = useMemo(
    () =>
      scanPreviews.flatMap((preview) =>
        preview.items.map((item) => ({
          item,
          preview,
          key: scanKey(preview, item),
          signals: extractCareerSignals(item),
          imported: importedExternalIds.has(item.externalId),
        })),
      ),
    [importedExternalIds, scanPreviews],
  );
  const scannedCandidates = useMemo(() => {
    const recordIds = new Set(scanRecordIds);
    const citationIds = new Set(
      (snapshot?.citations ?? [])
        .filter(
          (citation) =>
            citation.recordId !== undefined && recordIds.has(citation.recordId),
        )
        .map((citation) => citation.id),
    );
    return (snapshot?.evidenceItems ?? []).filter(
      (item) =>
        item.reviewState === "proposed" &&
        item.citationIds.some((id) => citationIds.has(id)),
    );
  }, [scanRecordIds, snapshot?.citations, snapshot?.evidenceItems]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    setError(undefined);
    try {
      await workspace.updateCareerProfile({
        currentRole,
        targetDirections,
        preferredWork,
        constraints,
        dealBreakers,
      });
      setMessage("筛选条件已保存；它们不会改变系统从经历推导出的方向。");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "求职背景保存失败。");
    } finally {
      setSaving(false);
    }
  }

  function exportBrief() {
    if (!snapshot) return;
    const markdown = buildCareerBriefMarkdown({
      profile: {
        currentRole,
        targetDirections,
        preferredWork,
        constraints,
        dealBreakers,
        updatedAt: saved?.updatedAt ?? new Date().toISOString(),
      },
      projects: snapshot.projects,
      evidenceItems: snapshot.evidenceItems,
      citations: snapshot.citations,
      caseStudies: snapshot.caseStudies,
      caseStudyRevisions: snapshot.caseStudyRevisions,
      outputBlocks: snapshot.outputBlocks,
      capabilityClaims: snapshot.capabilityClaims,
    });
    downloadText(
      markdown,
      `trace-career-direction-analysis-${new Date().toISOString().slice(0, 10)}.md`,
    );
    setMessage(
      "岗位方向分析包已下载。分享前请检查其中是否有公司或客户敏感信息。",
    );
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(ANALYSIS_PROMPT);
      setMessage("分析提示词已复制。上传岗位方向分析包后直接粘贴即可。");
    } catch {
      setError("浏览器没有允许复制。你可以手动选择并复制下方提示词。");
    }
  }

  async function scanLocalWorkSources() {
    setScanBusy("checking");
    setScanError(undefined);
    setScanMessage(undefined);
    setScanPreviews([]);
    setSelectedScanKeys([]);
    try {
      const health = await localCompanionClient.checkHealth();
      const providers = (["codex", "feishu"] as const).filter(
        (provider) => health.sources?.[provider].status === "ready",
      );
      if (providers.length === 0) {
        throw new Error(
          "本地伴侣已运行，但尚未发现可读取的 Codex 会话或飞书导出目录。",
        );
      }
      const results = await Promise.allSettled(
        providers.map((provider) =>
          localCompanionClient.requestPreview({ provider, scope: scanScope }),
        ),
      );
      const previews = results.flatMap((result) =>
        result.status === "fulfilled" ? [result.value] : [],
      );
      if (previews.length === 0) {
        throw new Error("没有找到符合当前时间范围的本机工作记录。");
      }
      const selectableKeys = previews
        .flatMap((preview) =>
          preview.items.map((item) => ({
            key: scanKey(preview, item),
            item,
          })),
        )
        .filter(
          ({ item }) =>
            !importedExternalIds.has(item.externalId) &&
            extractCareerSignals(item).length > 0,
        )
        .slice(0, MAX_AUTO_SELECTED_ITEMS)
        .map(({ key }) => key);
      setScanPreviews(previews);
      setSelectedScanKeys(selectableKeys);
      const total = previews.reduce(
        (sum, preview) => sum + preview.items.length,
        0,
      );
      setScanMessage(
        selectableKeys.length > 0
          ? `已扫描 ${providers.map(sourceLabel).join("、")}的 ${total} 条记录，初步找到 ${selectableKeys.length} 条含行动、判断、结果或反馈的材料。确认前不会写入工作册。`
          : `已扫描 ${total} 条记录，但暂时没有识别出新的工作成果信号。你可以调整时间范围后重试。`,
      );
    } catch (caught) {
      setScanError(
        caught instanceof CompanionUnavailableError
          ? "没有检测到本地伴侣。请先在 Trace 目录运行 npm run companion，再重新扫描。"
          : caught instanceof Error
            ? caught.message
            : "自动扫描失败，工作册没有被修改。",
      );
    } finally {
      setScanBusy(undefined);
    }
  }

  async function importScannedWork() {
    if (selectedScanKeys.length === 0) return;
    if (
      !window.confirm(
        `将导入 ${selectedScanKeys.length} 条本机材料，并自动生成待确认的工作证据。原始记录会保留来源，候选不会自动成为事实。继续吗？`,
      )
    ) {
      return;
    }
    setScanBusy("importing");
    setScanError(undefined);
    try {
      const importedRecordIds: string[] = [];
      for (const preview of scanPreviews) {
        const selectedItems = preview.items.filter((item) =>
          selectedScanKeys.includes(scanKey(preview, item)),
        );
        if (selectedItems.length === 0) continue;
        await localCompanionClient.confirmImport({
          previewId: preview.previewId,
          selectedExternalIds: selectedItems.map((item) => item.externalId),
        });
        const materialized = await workspace.confirmCompanionImport({
          preview,
          items: selectedItems,
        });
        importedRecordIds.push(
          ...materialized.records.map((record) => record.id),
        );
      }
      let candidateCount = 0;
      for (const recordId of importedRecordIds) {
        candidateCount += await workspace.createTextCandidates(recordId);
      }
      setScanRecordIds(importedRecordIds);
      setScanPreviews([]);
      setSelectedScanKeys([]);
      setScanMessage(
        candidateCount > 0
          ? `已从 ${importedRecordIds.length} 条工作记录中整理出 ${candidateCount} 条待确认候选。请在下方确认真实成果，岗位方向会随之自动更新。`
          : `已导入 ${importedRecordIds.length} 条原始记录，但没有识别出足够可靠的成果候选。`,
      );
    } catch (caught) {
      setScanError(
        caught instanceof Error
          ? caught.message
          : "导入或整理失败；已完成的原始记录仍会保留。",
      );
    } finally {
      setScanBusy(undefined);
    }
  }

  function toggleScannedItem(key: string) {
    setSelectedScanKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );
  }

  return (
    <section className="page career-page">
      <header className="page-header career-header">
        <div>
          <p className="eyebrow">求职梳理</p>
          <h1>先从经历里找方向，再判断你想去哪里。</h1>
          <p>
            Trace
            先根据已确认的事实、项目和能力边界推导可能胜任的岗位族；你的偏好和现实约束只用于随后筛选，不用于改写经历。
          </p>
        </div>
        <button
          className="button button-primary"
          type="button"
          onClick={exportBrief}
        >
          下载岗位方向分析包
        </button>
      </header>

      <div className="career-readiness" aria-label="求职材料准备情况">
        <ReadinessItem
          ready={outcomes.length > 0}
          title="成果与反馈"
          detail={
            outcomes.length > 0
              ? `已有 ${outcomes.length} 条已确认材料`
              : "先补充数据、变化或他人反馈"
          }
        />
        <ReadinessItem
          ready={finalizedCases.length > 0}
          title="代表项目"
          detail={
            finalizedCases.length > 0
              ? `已有 ${finalizedCases.length} 份定稿案例`
              : "至少整理一份完整项目案例"
          }
        />
        <ReadinessItem
          ready={confirmedClaims.length > 0}
          title="能力主张"
          detail={
            confirmedClaims.length > 0
              ? `已有 ${confirmedClaims.length} 条确认主张`
              : "从案例中沉淀克制的能力主张"
          }
        />
        <ReadinessItem
          ready={directionCandidates.length > 0}
          title="经历推导方向"
          detail={
            directionCandidates.length > 0
              ? `已有 ${directionCandidates.length} 个待验证方向`
              : "需要至少两条相互支持的经历"
          }
        />
      </div>

      <section className="career-auto-discovery" aria-labelledby="auto-title">
        <div className="career-auto-intro">
          <p className="eyebrow">自动发现</p>
          <h2 id="auto-title">让 Trace 主动寻找你的工作记录和成果</h2>
          <p>
            一次扫描已授权的本机 Codex 会话和飞书导出目录。Trace
            会先展示找到的记录，再导入为待确认候选；不会后台持续扫描，也不会自动把候选当成事实。
          </p>
        </div>
        <div className="career-scan-controls">
          <label>
            <span>扫描时间范围</span>
            <select
              value={scanScope}
              onChange={(event) => setScanScope(event.target.value)}
              disabled={scanBusy !== undefined}
            >
              <option value="最近90天">最近 90 天</option>
              <option value="最近365天">最近一年</option>
              <option value="全部">全部历史</option>
            </select>
          </label>
          <button
            className="button button-primary"
            type="button"
            onClick={() => void scanLocalWorkSources()}
            disabled={scanBusy !== undefined}
          >
            {scanBusy === "checking" ? "正在扫描…" : "自动扫描工作记录"}
          </button>
        </div>
        {scanMessage ? (
          <p className="data-management-message" role="status">
            {scanMessage}
          </p>
        ) : null}
        {scanError ? (
          <p className="data-management-error" role="alert">
            {scanError}
          </p>
        ) : null}
        {scannedItems.length > 0 ? (
          <div className="career-scan-preview">
            <header>
              <div>
                <p className="eyebrow">扫描预览</p>
                <h3>勾选确实属于你工作的材料</h3>
              </div>
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => void importScannedWork()}
                disabled={
                  selectedScanKeys.length === 0 || scanBusy !== undefined
                }
              >
                {scanBusy === "importing"
                  ? "正在导入并整理…"
                  : `导入并整理 ${selectedScanKeys.length} 条`}
              </button>
            </header>
            <div className="career-scan-list">
              {scannedItems.slice(0, MAX_AUTO_SELECTED_ITEMS).map((entry) => (
                <label key={entry.key}>
                  <input
                    type="checkbox"
                    checked={selectedScanKeys.includes(entry.key)}
                    onChange={() => toggleScannedItem(entry.key)}
                    disabled={entry.imported || entry.signals.length === 0}
                  />
                  <span>
                    <strong>{entry.item.title}</strong>
                    <small>
                      {sourceLabel(entry.preview.provider)} ·{" "}
                      {entry.item.occurredOn}
                      {entry.imported
                        ? " · 已导入"
                        : entry.signals.length > 0
                          ? ` · 找到 ${entry.signals.length} 条工作信号`
                          : " · 未发现明确工作信号"}
                    </small>
                    {entry.signals[0] ? <em>{entry.signals[0]}</em> : null}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ) : null}
        {scannedCandidates.length > 0 ? (
          <div className="career-candidate-review">
            <div className="section-kicker">
              <p className="eyebrow">待你确认</p>
              <h3>自动找到的工作成果与行动</h3>
            </div>
            <p>
              只有你确认的内容才会参与岗位方向推导。无法确认的内容可以直接排除。
            </p>
            <div>
              {scannedCandidates.map((candidate) => (
                <article key={candidate.id}>
                  <span>{evidenceLabel(candidate.type)}</span>
                  <p>{candidate.statement}</p>
                  <div>
                    <button
                      className="button button-secondary button-small"
                      type="button"
                      onClick={() =>
                        void workspace.confirmEvidence(candidate.id)
                      }
                    >
                      确认属实
                    </button>
                    <button
                      className="text-action"
                      type="button"
                      onClick={() =>
                        void workspace.rejectEvidence(candidate.id)
                      }
                    >
                      排除
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <div className="career-layout">
        <form
          className="career-profile"
          onSubmit={(event) => void saveProfile(event)}
        >
          <div className="section-kicker">
            <p className="eyebrow">你的筛选条件</p>
            <h2>在推导之后校正，而不是先填写答案</h2>
          </div>
          <p className="career-capability-link">
            已有能力线索仍可在
            <Link to="/capabilities">能力主张档案</Link>
            中逐条核对来源与边界。
          </p>
          <label className="field">
            <span>当前岗位与主要职责（可选背景）</span>
            <textarea
              value={currentRole}
              onChange={(event) => setCurrentRole(event.target.value)}
              rows={3}
              placeholder="例如：内容运营，负责选题、投放复盘和跨团队推进。"
            />
          </label>
          <label className="field">
            <span>对系统推导方向的反馈（可选）</span>
            <textarea
              value={targetDirections}
              onChange={(event) => setTargetDirections(event.target.value)}
              rows={3}
              placeholder="看完右侧结果再填写：哪些方向更感兴趣，哪些方向明显不符合实际。"
            />
          </label>
          <label className="field">
            <span>希望下一份工作增加什么</span>
            <textarea
              value={preferredWork}
              onChange={(event) => setPreferredWork(event.target.value)}
              rows={3}
              placeholder="想解决的问题、喜欢的工作方式、希望承担的责任。"
            />
          </label>
          <label className="field">
            <span>现实约束</span>
            <textarea
              value={constraints}
              onChange={(event) => setConstraints(event.target.value)}
              rows={3}
              placeholder="城市、行业、薪资、到岗时间、家庭安排等。"
            />
          </label>
          <label className="field">
            <span>明确排除项</span>
            <textarea
              value={dealBreakers}
              onChange={(event) => setDealBreakers(event.target.value)}
              rows={3}
              placeholder="不愿继续承受的工作内容或组织环境。"
            />
          </label>
          <button
            className="button button-secondary"
            type="submit"
            disabled={saving}
          >
            {saving ? "保存中…" : "保存筛选条件"}
          </button>
          {message ? (
            <p className="data-management-message" role="status">
              {message}
            </p>
          ) : null}
          {error ? (
            <p className="data-management-error" role="alert">
              {error}
            </p>
          ) : null}
        </form>

        <aside className="career-evidence">
          <div className="career-direction-section">
            <div className="section-kicker">
              <p className="eyebrow">经历推导 · 待验证</p>
              <h2>根据现有证据，你可能能做的岗位</h2>
            </div>
            <p className="career-direction-note">
              方向来自已确认经历和能力主张，不读取你填写的目标岗位。它是讨论起点，不是竞争力评分或最终职业结论。
            </p>
            {directionCandidates.length === 0 ? (
              <div className="career-empty">
                <p>
                  当前材料还不足以诚实地推导岗位方向。至少补充两条相互支持的判断、行动、结果或反馈。
                </p>
                <Link
                  className="button button-secondary button-small"
                  to="/records"
                >
                  回到记录补经历
                </Link>
              </div>
            ) : (
              <div className="career-direction-list">
                {directionCandidates.map((candidate) => {
                  const supportingItems = candidate.supportingEvidenceIds
                    .map((id) =>
                      confirmedEvidence.find((item) => item.id === id),
                    )
                    .filter((item) => item !== undefined)
                    .slice(0, 3);
                  return (
                    <article key={candidate.id}>
                      <div className="career-direction-heading">
                        <h3>{candidate.label}</h3>
                        <span>
                          {candidate.strength === "strong"
                            ? "较强线索"
                            : "初步线索"}
                        </span>
                      </div>
                      <p>{candidate.summary}</p>
                      <small>
                        反复出现：{candidate.matchedSignals.join("、")}
                      </small>
                      <ul>
                        {supportingItems.map((item) => (
                          <li key={item.id}>{item.statement}</li>
                        ))}
                      </ul>
                    </article>
                  );
                })}
              </div>
            )}
          </div>

          <div className="section-kicker">
            <p className="eyebrow">已确认材料</p>
            <h2>现在最能拿出来讲的成果</h2>
          </div>
          {outcomes.length === 0 ? (
            <div className="career-empty">
              <p>目前没有已确认的结果或反馈证据。</p>
              <Link
                className="button button-secondary button-small"
                to="/records"
              >
                回到记录补成果
              </Link>
            </div>
          ) : (
            <div className="career-outcome-list">
              {outcomes.slice(0, 8).map((item) => (
                <article key={item.id}>
                  <p className="folio">
                    {item.type === "result" ? "结果" : "反馈"} ·{" "}
                    {item.occurredOn}
                  </p>
                  <h3>{item.statement}</h3>
                  <span>
                    {projectById.get(item.projectId ?? "")?.name ?? "未归项目"}
                  </span>
                </article>
              ))}
            </div>
          )}

          <div className="career-handoff">
            <p className="eyebrow">最快完成路径</p>
            <h2>让 Codex 继续做更细的岗位分析</h2>
            <ol>
              <li>先查看系统从经历推导出的方向。</li>
              <li>补充偏好和约束，但不必填写目标岗位。</li>
              <li>下载岗位方向分析包，并检查敏感信息。</li>
              <li>
                把 Markdown 上传到新的或当前 Codex 对话，再粘贴下方提示词。
              </li>
            </ol>
            <textarea
              readOnly
              value={ANALYSIS_PROMPT}
              rows={9}
              aria-label="求职分析提示词"
            />
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => void copyPrompt()}
            >
              复制分析提示词
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function ReadinessItem({
  ready,
  title,
  detail,
}: {
  ready: boolean;
  title: string;
  detail: string;
}) {
  return (
    <div className={ready ? "is-ready" : undefined}>
      <span>{ready ? "已有" : "待补"}</span>
      <strong>{title}</strong>
      <small>{detail}</small>
    </div>
  );
}

function downloadText(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function scanKey(
  preview: CompanionImportPreview,
  item: CompanionPreviewItem,
): string {
  return `${preview.previewId}:${item.externalId}`;
}

function extractCareerSignals(item: CompanionPreviewItem): string[] {
  return extractTextEvidenceProposals(item.text)
    .filter(
      (proposal) =>
        proposal.type === "action" ||
        proposal.type === "decision" ||
        proposal.type === "result" ||
        proposal.type === "feedback",
    )
    .map((proposal) => proposal.statement);
}

function sourceLabel(provider: "codex" | "feishu"): string {
  return provider === "codex" ? "Codex" : "飞书";
}

function evidenceLabel(type: string): string {
  switch (type) {
    case "action":
      return "行动";
    case "decision":
      return "判断";
    case "result":
      return "结果";
    case "feedback":
      return "反馈";
    case "problem":
      return "问题";
    case "learning":
      return "学习";
    default:
      return "待验证";
  }
}
