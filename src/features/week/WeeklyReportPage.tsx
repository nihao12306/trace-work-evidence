import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useSearchParams } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";
import type {
  Citation,
  EpistemicKind,
  OutputBlock,
  SourceRecord,
  WeeklySectionKey,
} from "../../domain/model";
import {
  buildWeeklyMarkdown,
  weeklySectionLabels,
} from "../../infrastructure/export/weeklyMarkdown";
import {
  epistemicLabels,
  formatChineseDate,
  reviewLabels,
} from "../records/recordPresentation";

const sectionDescriptions: Record<WeeklySectionKey, string> = {
  focus: "本周真正投入判断和行动的事情。",
  results: "已经发生、能被来源支持的结果；没有就留空。",
  went_well: "有效的行动、反馈或形成的工作方法。",
  problems: "遇到的阻力、未解决的问题和边界。",
  supported_causes: "原始记录已经支持的原因，不把推测写成事实。",
  inferred_causes: "暂时的解释，必须保留推测身份。",
  next_validations: "下周准备验证的假设或问题，不是待办清单。",
  personal_reflection: "你自己的工作思考，Trace 不替你编写。",
};

export function WeeklyReportPage() {
  const workspace = useWorkspace();
  const [searchParams] = useSearchParams();
  const defaults = currentWeek();
  const weekStart = searchParams.get("weekStart") ?? defaults.start;
  const weekEnd = searchParams.get("weekEnd") ?? defaults.end;
  const [reviewId, setReviewId] = useState<string>();
  const [assembling, setAssembling] = useState(false);
  const [aiDrafting, setAiDrafting] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [startingRevision, setStartingRevision] = useState(false);
  const [selectedRevisionId, setSelectedRevisionId] = useState<string>();
  const existingReview = workspace.snapshot?.weeklyReviews.find(
    (item) => item.weekStart === weekStart,
  );

  useEffect(() => {
    let active = true;
    if (existingReview) {
      return () => {
        active = false;
      };
    }
    workspace
      .ensureWeeklyReview(weekStart, weekEnd)
      .then((id) => {
        if (active) setReviewId(id);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [existingReview, weekEnd, weekStart, workspace]);

  const review = workspace.snapshot?.weeklyReviews.find(
    (item) => item.id === reviewId || item.weekStart === weekStart,
  );
  const revisions = useMemo(
    () =>
      (workspace.snapshot?.weeklyReviewRevisions ?? [])
        .filter((item) => item.weeklyReviewId === review?.id)
        .sort((left, right) => right.revisionNumber - left.revisionNumber),
    [review?.id, workspace.snapshot?.weeklyReviewRevisions],
  );
  const currentRevision = revisions.find(
    (item) => item.id === review?.currentRevisionId,
  );
  const revision =
    revisions.find((item) => item.id === selectedRevisionId) ?? currentRevision;
  const isCurrentRevision = revision?.id === review?.currentRevisionId;
  const isRevisionFinalized = revision?.statusSnapshot === "finalized";
  const readOnly = !isCurrentRevision || Boolean(isRevisionFinalized);
  const blocks = useMemo(
    () =>
      (workspace.snapshot?.outputBlocks ?? [])
        .filter((block) => revision?.blockIds.includes(block.id))
        .sort((left, right) => left.order - right.order),
    [revision?.blockIds, workspace.snapshot?.outputBlocks],
  );
  const weekRecords = (workspace.snapshot?.records ?? []).filter(
    (record) =>
      record.lifecycle === "active" &&
      record.occurredOn >= weekStart &&
      record.occurredOn <= weekEnd,
  );
  const aiMode = workspace.snapshot?.settings?.aiMode ?? "off";
  const confirmedEvidenceCount = (
    workspace.snapshot?.evidenceItems ?? []
  ).filter(
    (evidence) =>
      evidence.reviewState === "confirmed" &&
      evidence.occurredOn >= weekStart &&
      evidence.occurredOn <= weekEnd,
  ).length;
  const sourceOptions = useMemo(
    () =>
      buildSourceOptions(
        workspace.snapshot?.citations ?? [],
        weekRecords,
        workspace.snapshot?.evidenceItems ?? [],
      ),
    [
      weekRecords,
      workspace.snapshot?.citations,
      workspace.snapshot?.evidenceItems,
    ],
  );

  async function assemble() {
    if (!review || review.status === "finalized") return;
    setAssembling(true);
    try {
      await workspace.assembleWeeklyCandidates(review.id);
    } finally {
      setAssembling(false);
    }
  }

  async function draftWithAi() {
    if (!review || review.status === "finalized") return;
    if (
      aiMode === "custom_endpoint" &&
      !window.confirm(
        [
          "即将发送本周已确认的证据给你配置的自定义 AI 端点。",
          `范围：${weekStart} 至 ${weekEnd}`,
          `记录：${weekRecords.length} 条；已确认证据：${confirmedEvidenceCount} 条`,
          "发送内容是证据表达、证据类型和来源引用 ID，不包含其他周的数据；Trace 不会发送 API Key。返回内容只会作为待确认周报候选。",
          "确认发送吗？",
        ].join("\n"),
      )
    ) {
      return;
    }
    setAiDrafting(true);
    try {
      await workspace.draftAiWeeklyCandidates(review.id);
    } finally {
      setAiDrafting(false);
    }
  }

  async function finalize() {
    if (!review || review.status === "finalized") return;
    if (
      !window.confirm(
        "定稿后，这一版周报会保留为不可覆盖的修订。之后修改会生成新修订。确定定稿吗？",
      )
    ) {
      return;
    }
    setFinalizing(true);
    try {
      await workspace.finalizeWeeklyReview(review.id);
    } finally {
      setFinalizing(false);
    }
  }

  async function startRevision() {
    if (!review || review.status !== "finalized") return;
    setStartingRevision(true);
    try {
      await workspace.startWeeklyRevision(review.id);
    } finally {
      setStartingRevision(false);
    }
  }

  function exportMarkdown() {
    const markdown = buildWeeklyMarkdown({
      weekStart,
      weekEnd,
      blocks,
      citations: workspace.snapshot?.citations ?? [],
    });
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `trace-week-${weekStart}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  if (!review || !revision) {
    return (
      <section className="page state-page">
        <p className="eyebrow">正在打开周报</p>
        <h1>把这一周的工作证据放到一起…</h1>
      </section>
    );
  }

  return (
    <section className="page weekly-report-page">
      <Link
        className="back-link"
        to={`/week?weekStart=${weekStart}&weekEnd=${weekEnd}`}
      >
        ← 返回本周工作台
      </Link>
      <header className="page-header report-header">
        <div>
          <p className="eyebrow">
            证据型周报 · {review.status === "finalized" ? "已定稿" : "草稿"}
          </p>
          <h1>{formatReportTitle(weekStart, weekEnd)}</h1>
          <p>
            {isRevisionFinalized
              ? "这一版周报已经定稿。再次修改会创建新修订，旧版本和来源仍然保留。"
              : "这是一份可编辑的组稿，不是自动生成的结论。候选内容必须经过你的确认，来源会一直留在段落旁边。"}
          </p>
          {revision ? (
            <label className="report-revision-picker">
              <span>查看版本</span>
              <select
                value={revision.id}
                onChange={(event) => setSelectedRevisionId(event.target.value)}
              >
                {revisions.map((item) => (
                  <option key={item.id} value={item.id}>
                    第 {item.revisionNumber} 版 ·{" "}
                    {item.statusSnapshot === "finalized" ? "已定稿" : "草稿"}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
        </div>
        <div className="report-actions">
          {!isCurrentRevision ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => setSelectedRevisionId(undefined)}
            >
              回到当前修订
            </button>
          ) : review.status === "finalized" ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => void startRevision()}
              disabled={startingRevision}
            >
              {startingRevision ? "准备新修订…" : "继续修改"}
            </button>
          ) : (
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => void assemble()}
                disabled={assembling || aiDrafting}
              >
                {assembling
                  ? "整理中…"
                  : blocks.length > 0
                    ? "补充新证据"
                    : "从已确认记录整理"}
              </button>
              {aiMode !== "off" ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => void draftWithAi()}
                  disabled={assembling || aiDrafting}
                >
                  {aiDrafting
                    ? "AI 起草中…"
                    : aiMode === "demo"
                      ? "演示 AI 起草（仍需确认）"
                      : "自定义端点起草（确认发送）"}
                </button>
              ) : null}
            </>
          )}
          {isCurrentRevision && review.status !== "finalized" ? (
            <button
              className="button button-primary"
              type="button"
              onClick={() => void finalize()}
              disabled={finalizing}
            >
              {finalizing ? "定稿中…" : "定稿周报"}
            </button>
          ) : null}
          <button
            className="button button-secondary"
            type="button"
            onClick={exportMarkdown}
          >
            导出 Markdown
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={() => window.print()}
          >
            打印 / 保存 PDF
          </button>
        </div>
      </header>

      <div className="report-notice">
        <strong>{weekRecords.length} 条本周记录</strong>
        <span>
          {isRevisionFinalized
            ? "这一版已经定稿；如需修改，请先创建新修订。"
            : blocks.length > 0
              ? `${blocks.filter((block) => block.reviewState === "confirmed").length} 段已确认，${blocks.filter((block) => block.reviewState !== "confirmed").length} 段仍需处理。`
              : "还没有组装周报内容；你可以先确认记录中的证据，再回到这里整理。"}
        </span>
      </div>

      <div className="report-sections">
        {(Object.keys(weeklySectionLabels) as WeeklySectionKey[]).map(
          (sectionKey) => (
            <ReportSection
              key={sectionKey}
              sectionKey={sectionKey}
              reviewId={review.id}
              blocks={blocks.filter((block) => block.sectionKey === sectionKey)}
              citations={workspace.snapshot?.citations ?? []}
              sourceOptions={sourceOptions}
              readOnly={readOnly}
              onRefresh={workspace.refresh}
            />
          ),
        )}
      </div>
    </section>
  );
}

function ReportSection({
  sectionKey,
  reviewId,
  blocks,
  citations,
  sourceOptions,
  readOnly,
  onRefresh,
}: {
  sectionKey: WeeklySectionKey;
  reviewId: string;
  blocks: OutputBlock[];
  citations: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["citations"];
  sourceOptions: SourceOption[];
  readOnly: boolean;
  onRefresh(): Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <section
      className="report-section"
      aria-labelledby={`report-section-${sectionKey}`}
    >
      <header>
        <div>
          <p className="folio">周报栏目</p>
          <h2 id={`report-section-${sectionKey}`}>
            {weeklySectionLabels[sectionKey]}
          </h2>
          <p>{sectionDescriptions[sectionKey]}</p>
        </div>
        {!readOnly ? (
          <button
            className="button button-secondary button-small"
            type="button"
            onClick={() => setAdding((value) => !value)}
          >
            {adding ? "取消添加" : "+ 添加一段"}
          </button>
        ) : (
          <span className="report-section-locked">本版已定稿</span>
        )}
      </header>
      {adding && !readOnly ? (
        <AddBlockForm
          reviewId={reviewId}
          sectionKey={sectionKey}
          sourceOptions={sourceOptions}
          onDone={async () => {
            setAdding(false);
            await onRefresh();
          }}
        />
      ) : null}
      {blocks.length === 0 && !adding ? (
        <div className="report-section-empty">
          <span>这一栏暂时留空。留空比编造一个漂亮结论更诚实。</span>
          {sectionKey === "results" ? (
            <Link className="text-action" to="/records">
              去补充一条记录 →
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="report-block-list">
          {blocks.map((block) => (
            <ReportBlockCard
              key={block.id}
              block={block}
              citations={citations}
              readOnly={readOnly}
              onRefresh={onRefresh}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function AddBlockForm({
  reviewId,
  sectionKey,
  sourceOptions,
  onDone,
}: {
  reviewId: string;
  sectionKey: WeeklySectionKey;
  sourceOptions: SourceOption[];
  onDone(): Promise<void>;
}) {
  const workspace = useWorkspace();
  const [content, setContent] = useState("");
  const [validationQuestion, setValidationQuestion] = useState("");
  const [epistemicKind, setEpistemicKind] =
    useState<EpistemicKind>("user_judgment");
  const [citationIds, setCitationIds] = useState<string[]>([]);
  const [formError, setFormError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const isValidationSection = sectionKey === "next_validations";
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (epistemicKind === "observed_fact" && citationIds.length === 0) {
      setFormError("已确认事实至少需要选择一条有效来源。");
      return;
    }
    if (
      isValidationSection &&
      !sourceOptions.some(
        (option) =>
          option.supportsHypothesis && citationIds.includes(option.id),
      )
    ) {
      setFormError("下周验证项必须关联一条假设或推测证据。");
      return;
    }
    if (isValidationSection && !validationQuestion.trim()) {
      setFormError("请先写清楚这次准备验证的问题。");
      return;
    }
    if (isValidationSection && !content.trim()) {
      setFormError("请先写清楚准备如何验证。");
      return;
    }
    setFormError(undefined);
    setSaving(true);
    try {
      await workspace.createWeeklyBlock({
        reviewId,
        sectionKey,
        content: isValidationSection
          ? `${validationQuestion.trim()}；验证方式：${content.trim()}`
          : content,
        epistemicKind: isValidationSection ? "hypothesis" : epistemicKind,
        citationIds,
      });
      setContent("");
      setValidationQuestion("");
      setCitationIds([]);
      await onDone();
    } finally {
      setSaving(false);
    }
  }
  return (
    <form
      className="report-block-form"
      onSubmit={(event) => void submit(event)}
    >
      <label className="field">
        <span>{isValidationSection ? "准备如何验证" : "写下这一栏的内容"}</span>
        <textarea
          required
          rows={3}
          value={content}
          onChange={(event) => setContent(event.target.value)}
          placeholder={
            isValidationSection
              ? "例如：用同一任务说明比较两个版本，观察完成率变化。"
              : "只写你愿意承担、并且能解释清楚的内容。"
          }
        />
      </label>
      {isValidationSection ? (
        <label className="field">
          <span>要验证的问题</span>
          <textarea
            required
            rows={2}
            value={validationQuestion}
            onChange={(event) => setValidationQuestion(event.target.value)}
            placeholder="这次具体想确认哪个假设或推测？"
          />
        </label>
      ) : null}
      <label className="field">
        <span>内容性质</span>
        <select
          value={epistemicKind}
          onChange={(event) =>
            setEpistemicKind(event.target.value as EpistemicKind)
          }
        >
          <option value="user_judgment">用户判断</option>
          <option value="observed_fact">已确认事实（需要来源）</option>
          <option value="hypothesis">待验证假设</option>
        </select>
      </label>
      <fieldset className="report-source-picker">
        <legend>
          {isValidationSection
            ? "关联假设或推测（必选）"
            : "引用来源（可选；已确认事实必填）"}
        </legend>
        {sourceOptions.length > 0 ? (
          <div className="report-source-options">
            {sourceOptions.map((option) => (
              <label className="report-source-option" key={option.id}>
                <input
                  type="checkbox"
                  checked={citationIds.includes(option.id)}
                  onChange={(event) =>
                    setCitationIds((current) =>
                      event.target.checked
                        ? [...current, option.id]
                        : current.filter((id) => id !== option.id),
                    )
                  }
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        ) : (
          <p className="report-source-picker-empty">
            {isValidationSection
              ? "本周还没有已确认的假设或推测；请先回到记录页整理并确认。"
              : "本周还没有可直接引用的记录来源。"}
          </p>
        )}
      </fieldset>
      {formError ? (
        <p className="form-error" role="alert">
          {formError}
        </p>
      ) : null}
      <footer>
        <button
          className="button button-primary button-small"
          type="submit"
          disabled={saving}
        >
          {saving ? "保存中…" : "保存为草稿"}
        </button>
      </footer>
    </form>
  );
}

function ReportBlockCard({
  block,
  citations,
  readOnly,
  onRefresh,
}: {
  block: OutputBlock;
  citations: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["citations"];
  readOnly: boolean;
  onRefresh(): Promise<void>;
}) {
  const workspace = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(block.content);
  const [epistemicKind, setEpistemicKind] = useState(block.epistemicKind);
  const sourceCitations = citations.filter((citation) =>
    block.citationIds.includes(citation.id),
  );

  async function save() {
    await workspace.updateWeeklyBlock(block.id, content, epistemicKind);
    setEditing(false);
    await onRefresh();
  }

  async function confirm() {
    await workspace.confirmWeeklyBlock(block.id);
    await onRefresh();
  }

  async function reject() {
    await workspace.rejectWeeklyBlock(block.id);
    await onRefresh();
  }

  async function restore() {
    await workspace.restoreWeeklyBlock(block.id);
    await onRefresh();
  }
  const aiReflectionNeedsEdit =
    block.sectionKey === "personal_reflection" && block.authoredBy === "ai";

  return (
    <article className={`report-block report-block-${block.reviewState}`}>
      <header>
        <div className="report-block-labels">
          <span>{outputAuthorLabel(block)}</span>
          <span>{epistemicLabels[block.epistemicKind]}</span>
        </div>
        <span className="review-label">{reviewLabels[block.reviewState]}</span>
      </header>
      {editing && !readOnly ? (
        <div className="report-edit-fields">
          <label className="field">
            <span>内容</span>
            <textarea
              rows={4}
              value={content}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <label className="field">
            <span>内容性质</span>
            <select
              value={epistemicKind}
              onChange={(event) =>
                setEpistemicKind(event.target.value as EpistemicKind)
              }
            >
              <option value="user_judgment">用户判断</option>
              <option value="observed_fact">已确认事实</option>
              <option value="ai_inference">AI 推测</option>
              <option value="hypothesis">待验证假设</option>
            </select>
          </label>
          <div className="report-inline-actions">
            <button
              className="button button-plain"
              type="button"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            <button
              className="button button-primary button-small"
              type="button"
              onClick={() => void save()}
            >
              保存修改
            </button>
          </div>
        </div>
      ) : (
        <p className="report-block-content">{block.content}</p>
      )}
      {sourceCitations.length > 0 ? (
        <details className="report-source-details">
          <summary>查看来源 · {sourceCitations.length} 处</summary>
          {sourceCitations.map((citation) => (
            <blockquote key={citation.id}>{citation.quoteSnapshot}</blockquote>
          ))}
        </details>
      ) : (
        <p className="report-no-source">这段目前没有直接来源。</p>
      )}
      {block.reviewState === "rejected" ? (
        <p className="report-no-source">
          这段已被你拒绝，不会进入定稿或导出；仍保留在修订历史中。
        </p>
      ) : null}
      {!editing && !readOnly ? (
        <footer>
          {block.reviewState === "rejected" ? (
            <button
              className="button button-plain button-small"
              type="button"
              onClick={() => void restore()}
            >
              恢复为待确认
            </button>
          ) : (
            <>
              <button
                className="text-action"
                type="button"
                onClick={() => setEditing(true)}
              >
                编辑
              </button>
              {block.reviewState !== "confirmed" ? (
                <button
                  className="button button-plain button-small"
                  type="button"
                  onClick={() => void reject()}
                >
                  拒绝
                </button>
              ) : null}
              {block.reviewState !== "confirmed" ? (
                <button
                  className="button button-primary button-small"
                  type="button"
                  onClick={() => void confirm()}
                  disabled={aiReflectionNeedsEdit}
                >
                  {aiReflectionNeedsEdit ? "先编辑为我的思考" : "确认这段"}
                </button>
              ) : null}
            </>
          )}
        </footer>
      ) : null}
    </article>
  );
}

function outputAuthorLabel(block: OutputBlock): string {
  if (block.authoredBy === "ai") {
    return block.authorshipNote === "ai_drafted_user_edited"
      ? "AI 起草 · 用户已修改"
      : "AI 起草";
  }
  return block.authoredBy === "system" ? "证据组装" : "用户书写";
}

function currentWeek() {
  const today = new Date().toISOString().slice(0, 10);
  const date = new Date(`${today}T00:00:00Z`);
  const day = date.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  date.setUTCDate(date.getUTCDate() - daysSinceMonday);
  const start = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  return { start, end: date.toISOString().slice(0, 10) };
}

interface SourceOption {
  id: string;
  label: string;
  supportsHypothesis: boolean;
}

function buildSourceOptions(
  citations: readonly Citation[],
  records: readonly SourceRecord[],
  evidenceItems: readonly import("../../domain/model").EvidenceItem[],
): SourceOption[] {
  const recordById = new Map(records.map((record) => [record.id, record]));
  const hypothesisCitationIds = new Set(
    evidenceItems
      .filter(
        (evidence) =>
          evidence.reviewState === "confirmed" &&
          (evidence.type === "hypothesis" ||
            evidence.epistemicKind === "ai_inference" ||
            evidence.epistemicKind === "hypothesis"),
      )
      .flatMap((evidence) => evidence.citationIds),
  );
  return citations
    .filter(
      (citation) =>
        citation.targetKind === "source_record_revision" &&
        citation.validity === "valid" &&
        citation.recordId !== undefined &&
        recordById.has(citation.recordId),
    )
    .map((citation) => {
      const record = recordById.get(citation.recordId!);
      const quote = citation.quoteSnapshot.replace(/\s+/gu, " ").trim();
      const excerpt = quote.length > 72 ? `${quote.slice(0, 72)}…` : quote;
      return {
        id: citation.id,
        label: `${
          hypothesisCitationIds.has(citation.id) ? "关联假设 · " : ""
        }${formatChineseDate(record!.occurredOn)} · ${excerpt}`,
        supportsHypothesis: hypothesisCitationIds.has(citation.id),
      };
    });
}

function formatReportTitle(start: string, end: string): string {
  const [, startMonth, startDay] = start.split("-");
  const [, endMonth, endDay] = end.split("-");
  return `${Number(startMonth)} 月 ${Number(startDay)} 日 — ${Number(endMonth)} 月 ${Number(endDay)} 日`;
}
