import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";
import type {
  CaseSectionKey,
  EpistemicKind,
  OutputBlock,
} from "../../domain/model";
import { buildCaseStudyMarkdown } from "../../infrastructure/export/caseStudyMarkdown";

const sectionMeta: Record<CaseSectionKey, { label: string; hint: string }> = {
  background: { label: "背景", hint: "当时处在什么情境？" },
  problem: { label: "问题", hint: "真正需要解决的具体问题是什么？" },
  judgment: { label: "判断", hint: "你当时看到了什么，并据此做了什么判断？" },
  action: { label: "行动", hint: "你实际做了哪些事？" },
  iteration: { label: "迭代", hint: "过程中如何根据反馈调整？" },
  result: { label: "结果", hint: "已经发生、可以被来源支持的结果是什么？" },
  capability: {
    label: "形成的能力",
    hint: "你愿意用什么克制的话，描述形成的能力？",
  },
};

const kindLabels: Record<EpistemicKind, string> = {
  observed_fact: "已确认事实",
  user_judgment: "我的判断",
  ai_inference: "AI 推测",
  hypothesis: "待验证假设",
};

export function CaseStudyPage() {
  const { projectId, caseStudyId } = useParams();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>();
  const [editingBlockId, setEditingBlockId] = useState<string>();
  const [draftContent, setDraftContent] = useState("");
  const [draftKind, setDraftKind] = useState<EpistemicKind>("user_judgment");
  const [draftCitationIds, setDraftCitationIds] = useState<string[]>([]);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [evidenceSelectionTouched, setEvidenceSelectionTouched] =
    useState(false);
  const [saving, setSaving] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);

  const caseStudy = workspace.snapshot?.caseStudies.find(
    (item) => item.id === caseStudyId,
  );
  const project = workspace.snapshot?.projects.find(
    (item) => item.id === projectId,
  );
  const revisions = useMemo(
    () =>
      (workspace.snapshot?.caseStudyRevisions ?? [])
        .filter((revision) => revision.caseStudyId === caseStudyId)
        .sort((left, right) => right.revisionNumber - left.revisionNumber),
    [caseStudyId, workspace.snapshot?.caseStudyRevisions],
  );
  const currentRevision = revisions.find(
    (revision) => revision.id === caseStudy?.currentRevisionId,
  );
  const selectedRevision =
    revisions.find((revision) => revision.id === selectedRevisionId) ??
    currentRevision;
  const blocks = (selectedRevision?.blockIds ?? [])
    .map((id) =>
      workspace.snapshot?.outputBlocks.find((block) => block.id === id),
    )
    .filter((block): block is OutputBlock => block !== undefined)
    .sort((left, right) => left.order - right.order);
  const includedEvidence = (workspace.snapshot?.evidenceItems ?? []).filter(
    (evidence) => caseStudy?.includedEvidenceIds.includes(evidence.id),
  );
  const availableEvidence = (workspace.snapshot?.evidenceItems ?? []).filter(
    (evidence) =>
      evidence.projectId === caseStudy?.projectId &&
      evidence.occurredOn >= (caseStudy?.rangeStart ?? "") &&
      evidence.occurredOn <= (caseStudy?.rangeEnd ?? "") &&
      evidence.reviewState === "confirmed",
  );
  const effectiveSelectedEvidenceIds = evidenceSelectionTouched
    ? selectedEvidenceIds
    : (caseStudy?.includedEvidenceIds ?? []);
  const sourceOptions = includedEvidence.flatMap((evidence) =>
    evidence.citationIds
      .map((citationId) =>
        workspace.snapshot?.citations.find(
          (citation) => citation.id === citationId,
        ),
      )
      .filter(
        (citation): citation is NonNullable<typeof citation> =>
          citation !== undefined,
      )
      .map((citation) => ({
        id: citation.id,
        label: `${evidence.statement} · ${citation.quoteSnapshot}`,
        validity: citation.validity,
      })),
  );
  const isCurrentRevision = selectedRevision?.id === currentRevision?.id;
  const isFinalized = caseStudy?.status === "finalized";
  const aiMode = workspace.snapshot?.settings?.aiMode ?? "off";
  const existingCapabilityClaims = (
    workspace.snapshot?.capabilityClaims ?? []
  ).filter((claim) => claim.caseStudyIds.includes(caseStudy?.id ?? ""));

  if (!caseStudy || !project || !selectedRevision) {
    return (
      <section className="page missing-state">
        <p className="eyebrow">项目案例</p>
        <h1>没有找到这份案例。</h1>
        <Link
          className="button button-secondary"
          to={projectId ? `/projects/${projectId}` : "/projects"}
        >
          返回项目
        </Link>
      </section>
    );
  }
  const activeCaseStudy = caseStudy;
  const activeProject = project;

  function beginEdit(block: OutputBlock) {
    setEditingBlockId(block.id);
    setDraftContent(block.content);
    setDraftKind(block.epistemicKind);
    setDraftCitationIds(block.citationIds);
  }

  function toggleCitation(citationId: string) {
    setDraftCitationIds((current) =>
      current.includes(citationId)
        ? current.filter((item) => item !== citationId)
        : [...current, citationId],
    );
  }

  function toggleCaseEvidence(evidenceId: string) {
    setEvidenceSelectionTouched(true);
    setSelectedEvidenceIds(
      effectiveSelectedEvidenceIds.includes(evidenceId)
        ? effectiveSelectedEvidenceIds.filter((id) => id !== evidenceId)
        : [...effectiveSelectedEvidenceIds, evidenceId],
    );
  }

  async function saveEvidenceSelection() {
    setSaving(true);
    try {
      await workspace.updateCaseStudyEvidenceSelection(
        activeCaseStudy.id,
        effectiveSelectedEvidenceIds,
      );
      setEvidenceSelectionTouched(false);
    } finally {
      setSaving(false);
    }
  }

  async function draftWithAi() {
    if (
      aiMode === "custom_endpoint" &&
      !window.confirm(
        [
          "即将发送这份项目案例纳入的已确认证据给你配置的自定义 AI 端点。",
          `项目：${activeProject.name}`,
          `范围：${activeCaseStudy.rangeStart} 至 ${activeCaseStudy.rangeEnd}`,
          `已确认纳入证据：${includedEvidence.filter((evidence) => evidence.reviewState === "confirmed").length} 条`,
          "发送内容是证据表达、证据类型和来源引用 ID；Trace 不会发送 API Key。返回内容只会作为待确认案例候选。",
          "确认发送吗？",
        ].join("\n"),
      )
    ) {
      return;
    }
    setAiDrafting(true);
    try {
      await workspace.draftAiCaseStudyCandidates(activeCaseStudy.id);
    } finally {
      setAiDrafting(false);
    }
  }

  async function saveBlock(blockId: string) {
    setSaving(true);
    try {
      await workspace.updateCaseStudyBlock(
        blockId,
        draftContent,
        draftKind,
        draftCitationIds,
      );
      setEditingBlockId(undefined);
    } finally {
      setSaving(false);
    }
  }

  function exportMarkdown() {
    if (!selectedRevision) return;
    const markdown = buildCaseStudyMarkdown({
      caseStudy: activeCaseStudy,
      project: activeProject,
      revision: selectedRevision,
      blocks,
      evidenceItems: includedEvidence,
      citations: workspace.snapshot?.citations ?? [],
    });
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trace-case-${activeCaseStudy.id}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function openPrintPage() {
    navigate(`/projects/${activeProject.id}/cases/${activeCaseStudy.id}/print`);
  }

  return (
    <section className="page case-study-page">
      <Link className="back-link" to={`/projects/${project.id}`}>
        ← {project.name}
      </Link>
      <header className="page-header case-study-header">
        <div>
          <p className="eyebrow">
            项目案例 · {isFinalized ? "已定稿" : "草稿"}
          </p>
          <h1>{caseStudy.title}</h1>
          <p>
            {caseStudy.rangeStart} — {caseStudy.rangeEnd} ·{" "}
            {includedEvidence.length} 条纳入证据
          </p>
        </div>
        <div className="case-study-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={exportMarkdown}
          >
            导出 Markdown
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={openPrintPage}
          >
            打开打印页
          </button>
          {isFinalized ? (
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={() =>
                  void workspace.startCaseStudyRevision(caseStudy.id)
                }
                disabled={saving}
              >
                继续修改
              </button>
              {existingCapabilityClaims.length > 0 ? (
                <Link
                  className="button button-secondary"
                  to={`/capabilities/${existingCapabilityClaims[0]!.id}`}
                >
                  查看能力主张
                </Link>
              ) : (
                <button
                  className="button button-primary"
                  type="button"
                  onClick={() =>
                    navigate(`/capabilities/new?caseStudyId=${caseStudy.id}`)
                  }
                >
                  沉淀为能力线索
                </button>
              )}
            </>
          ) : (
            <>
              {aiMode !== "off" ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void draftWithAi()}
                  disabled={saving || aiDrafting || !isCurrentRevision}
                >
                  {aiDrafting
                    ? "AI 起草中…"
                    : aiMode === "demo"
                      ? "演示 AI 起草（仍需确认）"
                      : "自定义端点起草（确认发送）"}
                </button>
              ) : null}
              <button
                className="button button-primary"
                type="button"
                onClick={() => void workspace.finalizeCaseStudy(caseStudy.id)}
                disabled={saving || aiDrafting || !isCurrentRevision}
              >
                定稿案例
              </button>
            </>
          )}
        </div>
      </header>

      {revisions.length > 1 ? (
        <label className="case-revision-picker">
          <span>修订版本</span>
          <select
            value={selectedRevision?.id}
            onChange={(event) => {
              setSelectedRevisionId(event.target.value);
              setEditingBlockId(undefined);
            }}
          >
            {revisions.map((revision) => (
              <option key={revision.id} value={revision.id}>
                v{revision.revisionNumber} ·{" "}
                {revision.id === currentRevision?.id ? "当前" : "历史"}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      <div className="case-study-note">
        <strong>案例不是能力结论。</strong>
        <span>
          它先把一段工作的背景、判断、行动和结果完整写下来；能力主张只有在你主动选择、且证据链完整时才会另行形成，并保留这份案例的范围。
        </span>
      </div>

      <div className="case-study-layout">
        <div className="case-block-list">
          {blocks.map((block) => {
            const meta = sectionMeta[block.sectionKey as CaseSectionKey];
            const editable = isCurrentRevision && !isFinalized;
            const editing = editingBlockId === block.id && editable;
            return (
              <article
                className={`case-block case-block-${block.reviewState}`}
                key={block.id}
              >
                <header>
                  <div>
                    <p className="folio">
                      {String(block.order + 1).padStart(2, "0")}
                    </p>
                    <h2>{meta.label}</h2>
                    <p>{meta.hint}</p>
                  </div>
                  <div className="case-block-labels">
                    <span>{caseBlockAuthorLabel(block)}</span>
                    <span>{kindLabels[block.epistemicKind]}</span>
                    <span>
                      {block.reviewState === "confirmed"
                        ? "已确认"
                        : block.reviewState === "rejected"
                          ? "已拒绝"
                          : "待确认"}
                    </span>
                  </div>
                </header>

                {editing ? (
                  <div className="case-block-form">
                    <label className="field">
                      <span>写下这一段</span>
                      <textarea
                        value={draftContent}
                        onChange={(event) =>
                          setDraftContent(event.target.value)
                        }
                        rows={5}
                      />
                    </label>
                    <label className="field">
                      <span>这段内容属于</span>
                      <select
                        value={draftKind}
                        onChange={(event) =>
                          setDraftKind(event.target.value as EpistemicKind)
                        }
                      >
                        {Object.entries(kindLabels).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <CitationPicker
                      options={sourceOptions}
                      selected={draftCitationIds}
                      onToggle={toggleCitation}
                    />
                    <footer className="case-inline-actions">
                      <button
                        className="button button-secondary button-small"
                        type="button"
                        onClick={() => setEditingBlockId(undefined)}
                      >
                        取消
                      </button>
                      <button
                        className="button button-primary button-small"
                        type="button"
                        onClick={() => void saveBlock(block.id)}
                        disabled={saving}
                      >
                        保存这段
                      </button>
                    </footer>
                  </div>
                ) : (
                  <>
                    <div className="case-block-content">
                      {block.content || (
                        <span className="case-block-placeholder">
                          还没有写下内容。
                        </span>
                      )}
                    </div>
                    {block.citationIds.length > 0 ? (
                      <CitationSummary block={block} options={sourceOptions} />
                    ) : null}
                    {editable ? (
                      <footer className="case-inline-actions">
                        {block.reviewState === "rejected" ? (
                          <button
                            className="button button-plain button-small"
                            type="button"
                            onClick={() =>
                              void workspace.restoreCaseStudyBlock(block.id)
                            }
                          >
                            恢复为待确认
                          </button>
                        ) : (
                          <>
                            <button
                              className="button button-secondary button-small"
                              type="button"
                              onClick={() => beginEdit(block)}
                            >
                              {block.content ? "编辑这段" : "开始写"}
                            </button>
                            {block.reviewState !== "confirmed" ? (
                              <button
                                className="button button-plain button-small"
                                type="button"
                                onClick={() =>
                                  void workspace.rejectCaseStudyBlock(block.id)
                                }
                              >
                                拒绝
                              </button>
                            ) : null}
                            <button
                              className="button button-plain button-small"
                              type="button"
                              onClick={() =>
                                void workspace.confirmCaseStudyBlock(block.id)
                              }
                              disabled={
                                !block.content ||
                                block.reviewState === "confirmed"
                              }
                            >
                              {block.reviewState === "confirmed"
                                ? "已确认"
                                : "确认这段"}
                            </button>
                          </>
                        )}
                      </footer>
                    ) : null}
                  </>
                )}
              </article>
            );
          })}
        </div>

        <aside className="case-source-aside">
          <p className="folio">证据范围</p>
          <h2>这份案例引用了什么？</h2>
          <p>
            这里只列出创建案例时纳入的已确认项目证据。原始记录不会被移动或改写。
          </p>
          <div className="case-source-list">
            {includedEvidence.map((evidence) => (
              <div className="case-source-item" key={evidence.id}>
                <span className="source-pill">{evidence.type}</span>
                <p>{evidence.statement}</p>
              </div>
            ))}
          </div>
          {!isFinalized && isCurrentRevision ? (
            <>
              <fieldset className="case-evidence-picker">
                <legend>
                  调整纳入证据 · {effectiveSelectedEvidenceIds.length} 条
                </legend>
                {availableEvidence.map((evidence) => (
                  <label key={evidence.id}>
                    <input
                      type="checkbox"
                      checked={effectiveSelectedEvidenceIds.includes(
                        evidence.id,
                      )}
                      onChange={() => toggleCaseEvidence(evidence.id)}
                    />
                    <span>{evidence.statement}</span>
                  </label>
                ))}
              </fieldset>
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={() => void saveEvidenceSelection()}
                disabled={!evidenceSelectionTouched || saving}
              >
                保存证据范围
              </button>
            </>
          ) : (
            <Link
              className="button button-secondary button-small"
              to={`/projects/${project.id}`}
            >
              返回项目
            </Link>
          )}
        </aside>
      </div>
    </section>
  );
}

function caseBlockAuthorLabel(block: OutputBlock): string {
  if (block.authoredBy === "ai") {
    return block.authorshipNote === "ai_drafted_user_edited"
      ? "AI 起草 · 用户已修改"
      : "AI 起草";
  }
  return block.authoredBy === "system" ? "证据组装" : "用户书写";
}

export function CaseStudyPrintPage() {
  const { projectId, caseStudyId } = useParams();
  const workspace = useWorkspace();
  const caseStudy = workspace.snapshot?.caseStudies.find(
    (item) => item.id === caseStudyId,
  );
  const project = workspace.snapshot?.projects.find(
    (item) => item.id === projectId,
  );
  const revision = workspace.snapshot?.caseStudyRevisions.find(
    (item) => item.id === caseStudy?.currentRevisionId,
  );
  const blocks = (revision?.blockIds ?? [])
    .map((id) =>
      workspace.snapshot?.outputBlocks.find((block) => block.id === id),
    )
    .filter((block): block is OutputBlock => block !== undefined)
    .filter((block) => block.reviewState !== "rejected")
    .sort((left, right) => left.order - right.order);
  const evidence = (workspace.snapshot?.evidenceItems ?? []).filter((item) =>
    caseStudy?.includedEvidenceIds.includes(item.id),
  );

  if (!caseStudy || !project || !revision) {
    return (
      <section className="page missing-state">
        <p className="eyebrow">打印页</p>
        <h1>没有找到这份项目案例。</h1>
        <Link className="button button-secondary" to="/projects">
          返回项目
        </Link>
      </section>
    );
  }

  return (
    <main className="case-print-page">
      <div className="case-print-actions">
        <Link
          className="button button-secondary"
          to={`/projects/${project.id}/cases/${caseStudy.id}`}
        >
          返回案例
        </Link>
        <button
          className="button button-primary"
          type="button"
          onClick={() => window.print()}
        >
          打印 / 保存 PDF
        </button>
      </div>
      <p className="case-print-meta">TRACE / 工作证据册 · 项目案例</p>
      <h1>{caseStudy.title}</h1>
      <p className="case-print-meta">
        项目：{project.name}
        <br />
        时间范围：{caseStudy.rangeStart} — {caseStudy.rangeEnd}
        <br />
        状态：{caseStudy.status === "finalized" ? "已定稿" : "草稿"}
      </p>
      <div className="case-print-sections">
        {blocks.map((block) => {
          const meta = sectionMeta[block.sectionKey as CaseSectionKey];
          return (
            <section key={block.id}>
              <p className="case-print-kicker">{meta.label}</p>
              <h2>{meta.label}</h2>
              <p className="case-print-label">
                {kindLabels[block.epistemicKind]}
                {block.reviewState === "confirmed" ? " · 已确认" : " · 待确认"}
              </p>
              <p className="case-print-content">{block.content}</p>
            </section>
          );
        })}
      </div>
      <section className="case-print-evidence">
        <p className="case-print-kicker">证据索引</p>
        <h2>这份案例引用了什么？</h2>
        {evidence.length === 0 ? (
          <p className="case-print-muted">暂无纳入证据</p>
        ) : (
          evidence.map((item, index) => {
            const sources = item.citationIds
              .map((id) =>
                workspace.snapshot?.citations.find(
                  (citation) => citation.id === id,
                ),
              )
              .filter(
                (citation): citation is NonNullable<typeof citation> =>
                  citation !== undefined,
              );
            return (
              <article key={item.id}>
                <strong>
                  {index + 1}. {item.type}
                </strong>
                <p>{item.statement}</p>
                {sources.map((citation) => (
                  <blockquote key={citation.id}>
                    {citation.quoteSnapshot}
                  </blockquote>
                ))}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}

function CitationPicker({
  options,
  selected,
  onToggle,
}: {
  options: { id: string; label: string; validity: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <fieldset className="case-citation-picker">
      <legend>来源依据 · 可选；事实段必须选有效来源</legend>
      {options.length === 0 ? (
        <p>这段暂时没有可选来源。</p>
      ) : (
        options.map((option) => (
          <label key={option.id}>
            <input
              type="checkbox"
              checked={selected.includes(option.id)}
              onChange={() => onToggle(option.id)}
              disabled={option.validity !== "valid"}
            />
            <span>{option.label}</span>
            {option.validity !== "valid" ? (
              <em>{option.validity === "stale" ? "来源已过期" : "来源缺失"}</em>
            ) : null}
          </label>
        ))
      )}
    </fieldset>
  );
}

function CitationSummary({
  block,
  options,
}: {
  block: OutputBlock;
  options: { id: string; label: string; validity: string }[];
}) {
  const labels = block.citationIds
    .map((id) => options.find((option) => option.id === id)?.label)
    .filter((label): label is string => Boolean(label));
  return labels.length > 0 ? (
    <details className="case-citation-summary">
      <summary>查看 {labels.length} 条来源</summary>
      {labels.map((label) => (
        <blockquote key={label}>{label}</blockquote>
      ))}
    </details>
  ) : null;
}
