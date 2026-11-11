import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";
import type { EvidenceItem } from "../../domain/model";
import { shortDate } from "../records/recordPresentation";

const evidenceTypeLabels: Record<EvidenceItem["type"], string> = {
  action: "行动",
  problem: "问题",
  decision: "决策",
  result: "结果",
  feedback: "反馈",
  learning: "学习",
  hypothesis: "假设",
};

const claimStatusLabels = {
  draft: "能力线索 · 待补证据",
  proposed: "待确认",
  confirmed: "已确认",
  rejected: "已拒绝",
} as const;

export function CapabilitiesPage() {
  const workspace = useWorkspace();
  const claims = [...(workspace.snapshot?.capabilityClaims ?? [])].sort(
    (left, right) => right.updatedAt.localeCompare(left.updatedAt),
  );
  const projects = workspace.snapshot?.projects ?? [];

  return (
    <section className="page capabilities-page">
      <header className="page-header capabilities-header">
        <div>
          <p className="eyebrow">长期表达</p>
          <h1>能力主张</h1>
          <p>
            这里不是给你打分，而是把“我能做什么”放回具体情境、行为、结果和反馈中。
          </p>
        </div>
      </header>

      <div className="capability-boundary-note">
        <strong>先证明一段，再谈长期能力。</strong>
        <span>
          单项目主张只说明“在这段已定稿案例中有证据支持”，不会自动变成跨项目或稳定人格标签。
        </span>
      </div>

      {claims.length === 0 ? (
        <div className="empty-state">
          <p className="folio">还没有能力主张</p>
          <h2>从一份已定稿项目案例开始。</h2>
          <p>先写完整背景、判断、行动和结果，再主动选择是否沉淀为能力主张。</p>
          <Link className="button button-primary" to="/projects">
            查看项目案例
          </Link>
        </div>
      ) : (
        <div className="capability-list">
          {claims.map((claim) => {
            const linkedProjects = projects.filter((project) =>
              (workspace.snapshot?.caseStudies ?? [])
                .filter((caseStudy) =>
                  claim.caseStudyIds.includes(caseStudy.id),
                )
                .some((caseStudy) => caseStudy.projectId === project.id),
            );
            return (
              <Link
                className="capability-row"
                key={claim.id}
                to={`/capabilities/${claim.id}`}
              >
                <div className="capability-row-main">
                  <span className="capability-mark" aria-hidden="true" />
                  <div>
                    <p className="folio">
                      {claimStatusLabels[claim.reviewState]}
                    </p>
                    <h2>{claim.title}</h2>
                    <p>{claim.statement}</p>
                  </div>
                </div>
                <div className="capability-row-meta">
                  <span>单项目范围</span>
                  <span>
                    {linkedProjects.map((project) => project.name).join("、") ||
                      "项目案例"}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CapabilityClaimPage() {
  const { claimId } = useParams();
  const [searchParams] = useSearchParams();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const claim = workspace.snapshot?.capabilityClaims.find(
    (item) => item.id === claimId,
  );
  const requestedCaseStudyId = searchParams.get("caseStudyId") ?? "";
  const selectedCaseStudyId = claim?.caseStudyIds[0] ?? requestedCaseStudyId;
  const caseStudy = workspace.snapshot?.caseStudies.find(
    (item) => item.id === selectedCaseStudyId,
  );
  const project = workspace.snapshot?.projects.find(
    (item) => item.id === caseStudy?.projectId,
  );
  const evidenceItems = (workspace.snapshot?.evidenceItems ?? []).filter(
    (evidence) => caseStudy?.includedEvidenceIds.includes(evidence.id),
  );
  const sourceRecordIds = useMemo(() => {
    const citations = workspace.snapshot?.citations ?? [];
    return new Map(
      evidenceItems.map((evidence) => [
        evidence.id,
        evidence.citationIds
          .map(
            (citationId) =>
              citations.find((citation) => citation.id === citationId)
                ?.recordId,
          )
          .find((recordId): recordId is string => Boolean(recordId)),
      ]),
    );
  }, [evidenceItems, workspace.snapshot?.citations]);
  const [title, setTitle] = useState(() => claim?.title ?? "");
  const [statement, setStatement] = useState(() => claim?.statement ?? "");
  const [context, setContext] = useState(() => claim?.context ?? "");
  const [limitations, setLimitations] = useState(
    () =>
      claim?.limitations ??
      "目前只由一个项目支持，不能证明在其他情境中也能稳定复现。",
  );
  const [behaviorEvidenceIds, setBehaviorEvidenceIds] = useState<string[]>(
    () => claim?.behaviorEvidenceIds ?? [],
  );
  const [outcomeEvidenceIds, setOutcomeEvidenceIds] = useState<string[]>(
    () => claim?.outcomeEvidenceIds ?? [],
  );
  const [feedbackEvidenceIds, setFeedbackEvidenceIds] = useState<string[]>(
    () => claim?.feedbackEvidenceIds ?? [],
  );
  const [saving, setSaving] = useState(false);

  const evidenceByRole = useMemo(
    () => ({
      behavior: evidenceItems.filter(
        (evidence) =>
          evidence.type === "action" || evidence.type === "decision",
      ),
      outcome: evidenceItems.filter((evidence) => evidence.type === "result"),
      feedback: evidenceItems.filter(
        (evidence) => evidence.type === "feedback",
      ),
    }),
    [evidenceItems],
  );
  const chain = {
    context: context.trim().length > 0,
    behavior: behaviorEvidenceIds.length > 0,
    outcomeOrFeedback:
      outcomeEvidenceIds.length > 0 || feedbackEvidenceIds.length > 0,
    caseStudy: caseStudy?.status === "finalized",
  };
  const readOnly = claim?.reviewState === "confirmed";

  if (!caseStudy || !project) {
    return (
      <section className="page missing-state">
        <p className="eyebrow">能力主张</p>
        <h1>需要从一份已定稿的项目案例开始。</h1>
        <p className="muted-copy">Trace 不允许脱离项目案例凭空写能力结论。</p>
        <Link className="button button-secondary" to="/projects">
          返回项目
        </Link>
      </section>
    );
  }
  const activeCaseStudy = caseStudy;

  function toggleEvidence(
    evidenceId: string,
    role: "behavior" | "outcome" | "feedback",
  ) {
    const setter =
      role === "behavior"
        ? setBehaviorEvidenceIds
        : role === "outcome"
          ? setOutcomeEvidenceIds
          : setFeedbackEvidenceIds;
    setter((current) =>
      current.includes(evidenceId)
        ? current.filter((id) => id !== evidenceId)
        : [...current, evidenceId],
    );
  }

  async function saveClaim(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const input = {
        caseStudyId: activeCaseStudy.id,
        title,
        statement,
        context,
        behaviorEvidenceIds,
        outcomeEvidenceIds,
        feedbackEvidenceIds,
        limitations,
      };
      if (claim) {
        await workspace.updateCapabilityClaim(claim.id, input);
      } else {
        const createdId = await workspace.createCapabilityClaim(input);
        navigate(`/capabilities/${createdId}`, { replace: true });
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page capability-detail-page">
      <Link
        className="back-link"
        to={`/projects/${project.id}/cases/${caseStudy.id}`}
      >
        ← 返回项目案例
      </Link>
      <header className="page-header capability-detail-header">
        <div>
          <p className="eyebrow">
            能力主张 · {claim ? claimStatusLabels[claim.reviewState] : "新线索"}
          </p>
          <h1>{claim ? claim.title : "从这段案例沉淀能力"}</h1>
          <p>
            来源案例：{caseStudy.title} · 只覆盖“{project.name}”这一段证据范围。
          </p>
        </div>
        {claim?.reviewState === "confirmed" ? (
          <span className="project-status project-status-active">已确认</span>
        ) : null}
      </header>

      <div className="capability-detail-layout">
        <form
          className="capability-form"
          onSubmit={(event) => void saveClaim(event)}
        >
          <label className="field">
            <span>能力标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：从观看动机反推内容结构"
              disabled={readOnly}
              required
            />
          </label>
          <label className="field">
            <span>我愿意主张什么</span>
            <textarea
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              placeholder="用克制的话写出在什么情境中，你能做出什么判断或行动。"
              rows={4}
              disabled={readOnly}
              required
            />
          </label>
          <label className="field">
            <span>情境与约束</span>
            <textarea
              value={context}
              onChange={(event) => setContext(event.target.value)}
              placeholder="当时面对什么问题？有什么约束？"
              rows={4}
              disabled={readOnly}
              required
            />
          </label>

          <EvidenceRolePicker
            title="行为证据"
            hint="至少一条行动或决策。它证明你实际做了什么。"
            items={evidenceByRole.behavior}
            selected={behaviorEvidenceIds}
            role="behavior"
            disabled={readOnly}
            onToggle={toggleEvidence}
            sourceRecordIds={sourceRecordIds}
          />
          <EvidenceRolePicker
            title="结果证据"
            hint="至少一条结果或反馈，才能从能力线索进入可确认主张。"
            items={evidenceByRole.outcome}
            selected={outcomeEvidenceIds}
            role="outcome"
            disabled={readOnly}
            onToggle={toggleEvidence}
            sourceRecordIds={sourceRecordIds}
          />
          <EvidenceRolePicker
            title="反馈证据"
            hint="外部反馈可与结果二选一，也可以同时保留。"
            items={evidenceByRole.feedback}
            selected={feedbackEvidenceIds}
            role="feedback"
            disabled={readOnly}
            onToggle={toggleEvidence}
            sourceRecordIds={sourceRecordIds}
          />

          <label className="field">
            <span>边界与暂时限制</span>
            <textarea
              value={limitations}
              onChange={(event) => setLimitations(event.target.value)}
              rows={3}
              disabled={readOnly}
            />
          </label>

          {!readOnly ? (
            <div className="capability-form-actions">
              <button
                className="button button-primary"
                type="submit"
                disabled={saving}
              >
                {saving
                  ? "正在保存…"
                  : claim
                    ? "保存能力线索"
                    : "保存为能力线索"}
              </button>
              {claim ? (
                <button
                  className="button button-plain"
                  type="button"
                  onClick={() => void workspace.rejectCapabilityClaim(claim.id)}
                  disabled={saving}
                >
                  拒绝这条线索
                </button>
              ) : null}
            </div>
          ) : null}
        </form>

        <aside className="capability-proof-aside">
          <p className="folio">确认前检查</p>
          <h2>这条主张证明了什么？</h2>
          <div className="proof-checklist">
            <ProofRow label="情境与约束" complete={chain.context} />
            <ProofRow label="行动或决策" complete={chain.behavior} />
            <ProofRow label="结果或反馈" complete={chain.outcomeOrFeedback} />
            <ProofRow label="已定稿项目案例" complete={chain.caseStudy} />
          </div>
          <p className="capability-boundary-copy">
            单项目能力主张不会写成“长期稳定”“持续擅长”或其他跨情境结论。未来如果有另一份独立项目案例，才可能重新讨论范围。
          </p>
          {claim?.reviewState !== "confirmed" ? (
            <button
              className="button button-secondary"
              type="button"
              onClick={() =>
                claim
                  ? void workspace.confirmCapabilityClaim(claim.id)
                  : undefined
              }
              disabled={!claim || saving}
            >
              确认这条能力主张
            </button>
          ) : null}
        </aside>
      </div>
    </section>
  );
}

function EvidenceRolePicker({
  title,
  hint,
  items,
  selected,
  role,
  disabled,
  onToggle,
  sourceRecordIds,
}: {
  title: string;
  hint: string;
  items: EvidenceItem[];
  selected: string[];
  role: "behavior" | "outcome" | "feedback";
  disabled: boolean;
  onToggle: (id: string, role: "behavior" | "outcome" | "feedback") => void;
  sourceRecordIds: Map<string, string | undefined>;
}) {
  return (
    <fieldset className="capability-evidence-picker">
      <legend>{title}</legend>
      <p>{hint}</p>
      {items.length === 0 ? (
        <span className="capability-picker-empty">
          案例范围内暂无匹配证据。
        </span>
      ) : (
        items.map((evidence) => {
          const recordId = sourceRecordIds.get(evidence.id);
          return (
            <div className="capability-evidence-option" key={evidence.id}>
              <label>
                <input
                  type="checkbox"
                  checked={selected.includes(evidence.id)}
                  onChange={() => onToggle(evidence.id, role)}
                  disabled={disabled}
                />
                <span>
                  <strong>{evidenceTypeLabels[evidence.type]}</strong>
                  {evidence.statement}
                  <small>{shortDate(evidence.occurredOn)}</small>
                </span>
              </label>
              {recordId ? (
                <Link
                  className="capability-evidence-source"
                  to={`/records/${recordId}`}
                >
                  查看原始记录
                </Link>
              ) : null}
            </div>
          );
        })
      )}
    </fieldset>
  );
}

function ProofRow({ label, complete }: { label: string; complete: boolean }) {
  return (
    <div className={`proof-row${complete ? " is-complete" : ""}`}>
      <span aria-hidden="true">{complete ? "已" : "待"}</span>
      <strong>{label}</strong>
      <em>{complete ? "已有依据" : "还缺一块"}</em>
    </div>
  );
}
