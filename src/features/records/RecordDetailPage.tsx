import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";
import type {
  EpistemicKind,
  EvidenceType,
  StructuredRecordFields,
} from "../../domain/model";
import {
  epistemicLabels,
  evidenceTypeLabels,
  formatChineseDate,
  reviewLabels,
} from "./recordPresentation";

export function RecordDetailPage() {
  const { recordId } = useParams();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { snapshot } = workspace;
  const record = snapshot?.records.find((item) => item.id === recordId);

  const revisions = useMemo(
    () =>
      (snapshot?.revisions ?? [])
        .filter((revision) => revision.recordId === recordId)
        .sort((left, right) => right.revisionNumber - left.revisionNumber),
    [recordId, snapshot?.revisions],
  );
  const currentRevision = revisions.find(
    (revision) => revision.id === record?.currentRevisionId,
  );
  const citations = (snapshot?.citations ?? []).filter(
    (citation) => citation.recordId === recordId,
  );
  const citationIds = new Set(citations.map((citation) => citation.id));
  const evidenceItems = (snapshot?.evidenceItems ?? [])
    .filter((evidence) =>
      evidence.citationIds.some((citationId) => citationIds.has(citationId)),
    )
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const project = snapshot?.projects.find(
    (item) => item.id === record?.projectId,
  );
  const aiMode = snapshot?.settings?.aiMode ?? "off";

  async function archiveRecord() {
    if (!record || record.lifecycle === "archived") return;
    if (
      !window.confirm(
        "归档后，这条记录会从普通记录列表隐藏，但原文、修订、证据和引用仍会保留。确认归档吗？",
      )
    ) {
      return;
    }
    await workspace.archiveRecord(record.id);
    await navigate("/records");
  }
  const usageByEvidence = useMemo(() => {
    const outputBlocks = snapshot?.outputBlocks ?? [];
    const weeklyRevisions = snapshot?.weeklyReviewRevisions ?? [];
    const weeklyReviews = snapshot?.weeklyReviews ?? [];
    const caseStudies = snapshot?.caseStudies ?? [];
    const projects = snapshot?.projects ?? [];
    const capabilityClaims = snapshot?.capabilityClaims ?? [];
    const weeklyRevisionById = new Map(
      weeklyRevisions.map((revision) => [revision.id, revision]),
    );
    return new Map(
      evidenceItems.map((evidence) => {
        const citationIdSet = new Set(evidence.citationIds);
        const usages: EvidenceUsage[] = [];
        const weeklyReviewIds = new Set(
          outputBlocks
            .filter(
              (block) =>
                block.ownerKind === "weekly_review_revision" &&
                block.reviewState !== "rejected" &&
                block.citationIds.some((id) => citationIdSet.has(id)),
            )
            .map(
              (block) => weeklyRevisionById.get(block.ownerId)?.weeklyReviewId,
            )
            .filter((id): id is string => Boolean(id)),
        );
        weeklyReviewIds.forEach((reviewId) => {
          const review = weeklyReviews.find((item) => item.id === reviewId);
          if (review) {
            usages.push({
              label:
                review.status === "finalized"
                  ? `周报 · ${review.weekStart}`
                  : `周报草稿 · ${review.weekStart}`,
              to: `/week/report?weekStart=${review.weekStart}&weekEnd=${review.weekEnd}`,
            });
          }
        });
        caseStudies
          .filter((caseStudy) =>
            caseStudy.includedEvidenceIds.includes(evidence.id),
          )
          .forEach((caseStudy) => {
            const caseProject = projects.find(
              (item) => item.id === caseStudy.projectId,
            );
            usages.push({
              label: `项目案例 · ${caseProject?.name ?? caseStudy.title}`,
              to: `/projects/${caseStudy.projectId}/cases/${caseStudy.id}`,
            });
          });
        capabilityClaims
          .filter(
            (claim) =>
              claim.reviewState !== "rejected" &&
              (claim.behaviorEvidenceIds.includes(evidence.id) ||
                claim.outcomeEvidenceIds.includes(evidence.id) ||
                claim.feedbackEvidenceIds.includes(evidence.id)),
          )
          .forEach((claim) => {
            usages.push({
              label: `能力主张 · ${claim.title}`,
              to: `/capabilities/${claim.id}`,
            });
          });
        return [evidence.id, usages];
      }),
    );
  }, [evidenceItems, snapshot]);

  if (!record || !currentRevision) {
    return (
      <section className="page missing-state">
        <p className="eyebrow">记录不存在</p>
        <h1>这条记录可能已被移除，或链接不完整。</h1>
        <Link className="button button-secondary" to="/records">
          返回记录
        </Link>
      </section>
    );
  }

  const structuredFields =
    currentRevision.structuredInput ?? record.originalStructuredInput;
  const hasStructuredInput =
    structuredFields && Object.values(structuredFields).some(Boolean);
  const existingStructuredCitation = citations.some(
    (citation) =>
      citation.targetId === currentRevision.id &&
      Boolean(citation.fieldPath) &&
      citation.fieldPath !== "originalText",
  );
  const existingTextCitation = citations.some(
    (citation) =>
      citation.targetId === currentRevision.id &&
      citation.fieldPath === "originalText",
  );
  const hasLegacyTextCandidate = evidenceItems.some(
    (evidence) =>
      evidence.authoredBy === "system" &&
      evidence.reviewState !== "rejected" &&
      evidence.citationIds.some((citationId) => {
        const citation = citations.find((item) => item.id === citationId);
        return (
          citation?.fieldPath === "originalText" &&
          citation.quoteSnapshot === evidence.statement
        );
      }),
  );
  const legacyExcerptCount = evidenceItems.filter((evidence) =>
    evidence.citationIds.some((citationId) => {
      const citation = citations.find((item) => item.id === citationId);
      return (
        evidence.authoredBy === "system" &&
        citation?.fieldPath === "originalText" &&
        citation.quoteSnapshot === evidence.statement
      );
    }),
  ).length;

  return (
    <article className="page record-detail">
      <Link className="back-link" to="/records">
        ← 返回记录
      </Link>
      <header className="record-detail-header">
        <div>
          <p className="eyebrow">{project?.name ?? "待归档"}</p>
          <h1>{formatChineseDate(record.occurredOn)}</h1>
        </div>
        <div className="record-detail-header-actions">
          <span className="revision-badge">
            第 {currentRevision.revisionNumber} 版
          </span>
          {record.lifecycle === "archived" ? (
            <span className="source-pill source-pill-unknown">已归档</span>
          ) : (
            <button
              className="button button-plain button-small"
              type="button"
              onClick={() => void archiveRecord()}
            >
              归档记录
            </button>
          )}
        </div>
      </header>

      <section className="source-document" aria-labelledby="source-title">
        <div className="section-title-row">
          <div>
            <p className="folio">原始记录</p>
            <h2 id="source-title">事情最初是这样被记下的</h2>
          </div>
          <span className="source-kind">用户原文</span>
        </div>
        <blockquote>{record.originalText}</blockquote>
        {currentRevision.text !== record.originalText ? (
          <div className="current-revision">
            <span>当前修订</span>
            <p>{currentRevision.text}</p>
          </div>
        ) : null}
        {structuredFields ? (
          <StructuredFields fields={structuredFields} />
        ) : null}
      </section>

      <div className="detail-columns">
        <section className="evidence-section" aria-labelledby="evidence-title">
          <header className="section-title-row">
            <div>
              <p className="folio">工作证据</p>
              <h2 id="evidence-title">把原话整理成可复用的证据表达</h2>
              <p className="evidence-intro">
                原文片段只是依据；下面的“整理后的证据表达”才是你要确认的内容。
              </p>
              {legacyExcerptCount > 0 ? (
                <p className="evidence-legacy-note">
                  这条记录里有 {legacyExcerptCount} 条旧版候选仍保留原话。Trace
                  不会静默改写已经确认的内容；点击“重新整理已有候选”后，才会按原文依据改写表达。你也可以直接点击“编辑这条证据”，把它改成自己的可复用表达。
                </p>
              ) : null}
            </div>
            <div className="candidate-actions">
              {!existingTextCitation ? (
                <CandidateButton
                  recordId={record.id}
                  label="从原始文字提炼证据表达"
                  onCreate={workspace.createTextCandidates}
                />
              ) : null}
              {!existingTextCitation && aiMode !== "off" ? (
                <CandidateButton
                  recordId={record.id}
                  label={
                    aiMode === "demo"
                      ? "演示 AI 提议（仍需确认）"
                      : "自定义端点提议（确认发送）"
                  }
                  {...(aiMode === "custom_endpoint"
                    ? {
                        confirmMessage: buildCustomAiConfirmMessage(
                          record.originalText,
                          project?.name,
                          formatChineseDate(record.occurredOn),
                        ),
                      }
                    : {})}
                  onCreate={workspace.createAiEvidenceCandidates}
                />
              ) : null}
              {hasLegacyTextCandidate ? (
                <CandidateButton
                  recordId={record.id}
                  label="重新整理已有候选"
                  confirmMessage="这会只重新整理 Trace 生成的原文直出候选：同一原文依据会保留，已确认的内容保留确认状态，重复片段会移入历史。要继续吗？"
                  onCreate={workspace.reframeTextCandidates}
                />
              ) : null}
              {hasStructuredInput && !existingStructuredCitation ? (
                <CandidateButton
                  recordId={record.id}
                  label="从补充细节生成候选"
                  onCreate={workspace.createStructuredCandidates}
                />
              ) : null}
            </div>
          </header>

          {evidenceItems.length === 0 ? (
            <div className="evidence-empty">
              <strong>还没有整理结果</strong>
              <span>
                先从原始文字提炼证据表达，Trace
                只复用你写下的内容；然后逐条采纳、修改或拒绝。
              </span>
            </div>
          ) : (
            <div className="evidence-stack">
              {evidenceItems.map((evidence) => (
                <EvidenceCard
                  key={evidence.id}
                  evidence={evidence}
                  citations={citations.filter((citation) =>
                    evidence.citationIds.includes(citation.id),
                  )}
                  revisions={revisions}
                  occurredOn={record.occurredOn}
                  {...(project?.name === undefined
                    ? {}
                    : { projectName: project.name })}
                  usages={usageByEvidence.get(evidence.id) ?? []}
                  onConfirm={workspace.confirmEvidence}
                  onReject={workspace.rejectEvidence}
                  onRestore={workspace.restoreEvidence}
                  onUpdate={workspace.updateEvidence}
                  onRepairCitation={workspace.repairCitation}
                />
              ))}
            </div>
          )}

          <EvidenceForm
            recordId={record.id}
            onCreate={workspace.createEvidence}
          />
        </section>

        <aside className="revision-section" aria-labelledby="revision-title">
          <p className="folio">修订历史</p>
          <h2 id="revision-title">保留每一次改写</h2>
          <RevisionForm
            recordId={record.id}
            currentText={currentRevision.text}
            onRevise={workspace.reviseRecord}
          />
          <ol className="revision-list">
            {revisions.map((revision) => (
              <li key={revision.id} id={`revision-${revision.id}`}>
                <div>
                  <strong>第 {revision.revisionNumber} 版</strong>
                  <time>{formatTimestamp(revision.createdAt)}</time>
                </div>
                <p>
                  {revision.changeNote ??
                    (revision.revisionNumber === 1
                      ? "首次记录"
                      : "未填写修订说明")}
                </p>
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </article>
  );
}

function StructuredFields({ fields }: { fields: StructuredRecordFields }) {
  const items = [
    ["做了什么", fields.action],
    ["遇到的问题", fields.problem],
    ["当前结果", fields.currentResult],
    ["一句话判断", fields.oneLineJudgment],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  return (
    <dl className="structured-fields">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function CandidateButton({
  recordId,
  label,
  confirmMessage,
  onCreate,
}: {
  recordId: string;
  label: string;
  confirmMessage?: string;
  onCreate(recordId: string): Promise<number>;
}) {
  const [pending, setPending] = useState(false);
  async function create() {
    if (confirmMessage && !window.confirm(confirmMessage)) return;
    setPending(true);
    try {
      await onCreate(recordId);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="candidate-action">
      <button
        className="button button-secondary"
        type="button"
        disabled={pending}
        onClick={() => void create()}
      >
        {pending ? "正在整理…" : label}
      </button>
    </div>
  );
}

function buildCustomAiConfirmMessage(
  originalText: string,
  projectName: string | undefined,
  occurredOn: string,
): string {
  const excerpt = originalText.replace(/\s+/g, " ").trim().slice(0, 90);
  return [
    "即将发送 1 条记录到你配置的自定义 AI 端点。",
    `日期：${occurredOn}`,
    `项目：${projectName ?? "待归档"}`,
    `内容：${excerpt}${originalText.length > 90 ? "…" : ""}`,
    "发送内容包含这条记录的完整原文、补充字段和现有来源摘录；Trace 不会发送 API Key。响应只会先作为待确认候选保存。",
    "确认发送吗？",
  ].join("\n");
}

function EvidenceCard({
  evidence,
  citations,
  revisions,
  occurredOn,
  projectName,
  usages,
  onConfirm,
  onReject,
  onRestore,
  onUpdate,
  onRepairCitation,
}: {
  evidence: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["evidenceItems"][number];
  citations: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["citations"];
  revisions: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["revisions"];
  occurredOn: string;
  projectName?: string;
  usages: EvidenceUsage[];
  onConfirm(id: string): Promise<void>;
  onReject(id: string): Promise<void>;
  onRestore(id: string): Promise<void>;
  onUpdate(
    id: string,
    input: {
      statement: string;
      type: EvidenceType;
      epistemicKind: EpistemicKind;
      resultStage?: "interim" | "final";
    },
  ): Promise<void>;
  onRepairCitation(id: string): Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [editing, setEditing] = useState(false);
  const isSourceExcerpt = citations.some(
    (citation) =>
      evidence.authoredBy === "system" &&
      citation.fieldPath === "originalText" &&
      citation.quoteSnapshot === evidence.statement,
  );
  const needsRewrite = isSourceExcerpt && evidence.reviewState === "proposed";
  async function decide(action: "confirm" | "reject" | "restore") {
    setPending(true);
    try {
      if (action === "confirm") await onConfirm(evidence.id);
      else if (action === "reject") await onReject(evidence.id);
      else await onRestore(evidence.id);
    } finally {
      setPending(false);
    }
  }
  return (
    <article className={`evidence-card evidence-${evidence.reviewState}`}>
      <header>
        <span className="type-label">{evidenceTypeLabels[evidence.type]}</span>
        <span className={`epistemic-label epistemic-${evidence.epistemicKind}`}>
          {epistemicLabels[evidence.epistemicKind]}
        </span>
        {evidence.authoredBy !== "user" ? (
          <span
            className={`authorship-label authorship-${evidence.authoredBy}`}
          >
            {evidence.authoredBy === "ai"
              ? "AI 整理"
              : isSourceExcerpt
                ? "原文直出（旧版候选）"
                : "Trace 整理"}
          </span>
        ) : null}
        <span className="review-label">
          {reviewLabels[evidence.reviewState]}
        </span>
      </header>
      {editing ? (
        <EvidenceEditForm
          evidence={evidence}
          onCancel={() => setEditing(false)}
          onSave={async (input) => {
            await onUpdate(evidence.id, input);
            setEditing(false);
          }}
        />
      ) : (
        <>
          <p className="evidence-expression-label">
            {isSourceExcerpt ? "原文直出（尚未提炼）" : "整理后的证据表达"}
          </p>
          <p className="evidence-statement">{evidence.statement}</p>
          {needsRewrite ? (
            <p className="evidence-rewrite-note">
              这条候选目前只是把原话归类，还没有完成抽象。请编辑成可复用的表达，或直接拒绝；确认它不会自动增加任何结果。
            </p>
          ) : null}
          <p className="evidence-purpose">
            <span>它能支持什么</span>
            {evidencePurpose[evidence.type]}
          </p>
          {evidence.resultStage ? (
            <p className="result-stage">
              {evidence.resultStage === "final" ? "最终结果" : "阶段性结果"}
            </p>
          ) : null}
        </>
      )}
      <details className="citation-details">
        <summary>查看原文依据 · {citations.length} 处</summary>
        {citations.map((citation) => {
          const revision = revisions.find(
            (item) => item.id === citation.targetId,
          );
          return (
            <div className="citation-source" key={citation.id}>
              <div className="citation-meta">
                <span>{formatChineseDate(occurredOn)}</span>
                <span>{projectName ?? "待归档"}</span>
                <span>
                  {revision ? `第 ${revision.revisionNumber} 版` : "修订缺失"}
                </span>
                <span
                  className={`citation-validity citation-${citation.validity}`}
                >
                  {citation.validity === "valid"
                    ? "来源有效"
                    : citation.validity === "stale"
                      ? "引用可能过期"
                      : "来源缺失"}
                </span>
              </div>
              <blockquote>{citation.quoteSnapshot}</blockquote>
              <div className="citation-actions">
                {revision ? (
                  <a href={`#revision-${revision.id}`}>在修订历史中定位</a>
                ) : null}
                {citation.validity !== "valid" ? (
                  <button
                    className="text-action"
                    type="button"
                    onClick={() => void onRepairCitation(citation.id)}
                  >
                    更新为当前修订来源
                  </button>
                ) : null}
              </div>
            </div>
          );
        })}
      </details>
      {usages.length > 0 ? (
        <div className="evidence-usage">
          <span>已经进入</span>
          <div>
            {usages.map((usage) => (
              <Link key={usage.to} to={usage.to}>
                {usage.label}
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {!editing && evidence.reviewState !== "rejected" ? (
        <button
          className="text-action evidence-edit-action"
          type="button"
          onClick={() => setEditing(true)}
        >
          编辑这条证据
        </button>
      ) : null}
      {evidence.reviewState === "proposed" ? (
        <footer>
          <button
            className="button button-plain"
            type="button"
            disabled={pending}
            onClick={() => void decide("reject")}
          >
            拒绝
          </button>
          <button
            className="button button-primary button-small"
            type="button"
            disabled={pending}
            onClick={() => void decide("confirm")}
          >
            采纳这条整理
          </button>
        </footer>
      ) : null}
      {evidence.reviewState === "rejected" ? (
        <footer className="rejected-footer">
          <p className="rejected-note">
            这条内容不会进入周报、案例或能力证明。
          </p>
          <button
            className="button button-plain"
            type="button"
            disabled={pending}
            onClick={() => void decide("restore")}
          >
            恢复为待确认
          </button>
        </footer>
      ) : null}
    </article>
  );
}

const evidencePurpose: Record<EvidenceType, string> = {
  action: "证明你实际采取过什么行动。",
  problem: "说明当时真正遇到的阻力和边界。",
  decision: "保留你做过的关键取舍与判断。",
  result: "记录已经发生、可以回看的结果。",
  feedback: "保留来自用户、同事或其他人的反馈。",
  learning: "记录你从这次工作中形成的判断。",
  hypothesis: "把尚未证实的解释留下，供下一步验证。",
};

interface EvidenceUsage {
  label: string;
  to: string;
}

function EvidenceEditForm({
  evidence,
  onCancel,
  onSave,
}: {
  evidence: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["evidenceItems"][number];
  onCancel(): void;
  onSave(input: {
    statement: string;
    type: EvidenceType;
    epistemicKind: EpistemicKind;
    resultStage?: "interim" | "final";
  }): Promise<void>;
}) {
  const [statement, setStatement] = useState(evidence.statement);
  const [type, setType] = useState(evidence.type);
  const [epistemicKind, setEpistemicKind] = useState(evidence.epistemicKind);
  const [resultStage, setResultStage] = useState(
    evidence.resultStage ?? "interim",
  );
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await onSave({
        statement,
        type,
        epistemicKind,
        ...(type === "result" ? { resultStage } : {}),
      });
    } catch {
      // The workspace alert explains the failure while keeping this form intact.
    } finally {
      setPending(false);
    }
  }
  return (
    <form
      className="evidence-form evidence-edit-form"
      onSubmit={(event) => void submit(event)}
    >
      <EvidenceFields
        statement={statement}
        type={type}
        epistemicKind={epistemicKind}
        resultStage={resultStage}
        onStatementChange={setStatement}
        onTypeChange={setType}
        onEpistemicKindChange={setEpistemicKind}
        onResultStageChange={setResultStage}
      />
      <footer>
        <button
          className="button button-plain"
          type="button"
          onClick={onCancel}
        >
          取消编辑
        </button>
        <button
          className="button button-primary button-small"
          type="submit"
          disabled={pending}
        >
          {pending ? "保存中…" : "保存修改"}
        </button>
      </footer>
    </form>
  );
}

function EvidenceForm({
  recordId,
  onCreate,
}: {
  recordId: string;
  onCreate(input: {
    recordId: string;
    statement: string;
    type: EvidenceType;
    epistemicKind: EpistemicKind;
    resultStage?: "interim" | "final";
  }): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [statement, setStatement] = useState("");
  const [type, setType] = useState<EvidenceType>("action");
  const [epistemicKind, setEpistemicKind] =
    useState<EpistemicKind>("observed_fact");
  const [resultStage, setResultStage] = useState<"interim" | "final">(
    "interim",
  );
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await onCreate({
        recordId,
        statement,
        type,
        epistemicKind,
        ...(type === "result" ? { resultStage } : {}),
      });
      setStatement("");
      setOpen(false);
    } catch {
      // The workspace alert explains the failure while preserving the draft.
    } finally {
      setPending(false);
    }
  }
  if (!open)
    return (
      <button
        className="add-evidence-button"
        type="button"
        onClick={() => setOpen(true)}
      >
        + 手动整理一条证据
      </button>
    );
  return (
    <form className="evidence-form" onSubmit={(event) => void submit(event)}>
      <EvidenceFields
        statement={statement}
        type={type}
        epistemicKind={epistemicKind}
        resultStage={resultStage}
        onStatementChange={setStatement}
        onTypeChange={setType}
        onEpistemicKindChange={setEpistemicKind}
        onResultStageChange={setResultStage}
      />
      <footer>
        <button
          className="button button-plain"
          type="button"
          onClick={() => setOpen(false)}
        >
          取消
        </button>
        <button
          className="button button-primary button-small"
          type="submit"
          disabled={pending}
        >
          {pending ? "保存中…" : "保存并确认"}
        </button>
      </footer>
    </form>
  );
}

function EvidenceFields({
  statement,
  type,
  epistemicKind,
  resultStage,
  onStatementChange,
  onTypeChange,
  onEpistemicKindChange,
  onResultStageChange,
}: {
  statement: string;
  type: EvidenceType;
  epistemicKind: EpistemicKind;
  resultStage: "interim" | "final";
  onStatementChange(value: string): void;
  onTypeChange(value: EvidenceType): void;
  onEpistemicKindChange(value: EpistemicKind): void;
  onResultStageChange(value: "interim" | "final"): void;
}) {
  return (
    <>
      <div className="form-row">
        <label className="field">
          <span>证据类型</span>
          <select
            value={type}
            onChange={(event) =>
              onTypeChange(event.target.value as EvidenceType)
            }
          >
            {Object.entries(evidenceTypeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>内容性质</span>
          <select
            value={epistemicKind}
            onChange={(event) =>
              onEpistemicKindChange(event.target.value as EpistemicKind)
            }
          >
            <option value="observed_fact">已确认事实</option>
            <option value="user_judgment">用户判断</option>
            <option value="hypothesis">待验证假设</option>
          </select>
        </label>
      </div>
      {type === "result" ? (
        <label className="field">
          <span>结果阶段</span>
          <select
            value={resultStage}
            onChange={(event) =>
              onResultStageChange(event.target.value as "interim" | "final")
            }
          >
            <option value="interim">阶段性结果</option>
            <option value="final">最终结果</option>
          </select>
        </label>
      ) : null}
      <label className="field">
        <span>证据陈述</span>
        <textarea
          required
          rows={3}
          value={statement}
          onChange={(event) => onStatementChange(event.target.value)}
          placeholder="只写原文能够支持的内容。"
        />
      </label>
    </>
  );
}

function RevisionForm({
  recordId,
  currentText,
  onRevise,
}: {
  recordId: string;
  currentText: string;
  onRevise(id: string, text: string, note?: string): Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(currentText);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      await onRevise(recordId, text, note);
      setOpen(false);
      setNote("");
    } finally {
      setPending(false);
    }
  }
  if (!open)
    return (
      <button
        className="text-action"
        type="button"
        onClick={() => setOpen(true)}
      >
        修订当前记录
      </button>
    );
  return (
    <form className="revision-form" onSubmit={(event) => void submit(event)}>
      <label className="field">
        <span>修订内容</span>
        <textarea
          required
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <label className="field">
        <span>修订说明（可选）</span>
        <input
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="例如：补充反馈发生的场景"
        />
      </label>
      <footer>
        <button
          className="button button-plain"
          type="button"
          onClick={() => setOpen(false)}
        >
          取消
        </button>
        <button
          className="button button-primary button-small"
          type="submit"
          disabled={pending}
        >
          保存新版本
        </button>
      </footer>
    </form>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
