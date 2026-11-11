import { FormEvent, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";
import type { EvidenceType } from "../../domain/model";
import { todayInTimeZone } from "../../domain/date";
import { shortDate } from "../records/recordPresentation";

const evidenceTypeLabels: Record<EvidenceType, string> = {
  action: "行动",
  problem: "问题",
  decision: "决策",
  result: "结果",
  feedback: "反馈",
  learning: "学习",
  hypothesis: "假设",
};

export function ProjectDetailPage() {
  const { projectId } = useParams();
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const project = workspace.snapshot?.projects.find(
    (item) => item.id === projectId,
  );
  const [title, setTitle] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [typeFilter, setTypeFilter] = useState<"all" | EvidenceType>("all");
  const [editingProject, setEditingProject] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("");
  const [projectDescriptionDraft, setProjectDescriptionDraft] = useState("");
  const [saving, setSaving] = useState(false);

  const records = useMemo(
    () =>
      (workspace.snapshot?.records ?? [])
        .filter(
          (record) =>
            record.projectId === projectId && record.lifecycle === "active",
        )
        .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn)),
    [projectId, workspace.snapshot?.records],
  );
  const confirmedEvidence = useMemo(
    () =>
      (workspace.snapshot?.evidenceItems ?? [])
        .filter(
          (evidence) =>
            evidence.projectId === projectId &&
            evidence.reviewState === "confirmed",
        )
        .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn)),
    [projectId, workspace.snapshot?.evidenceItems],
  );
  const visibleEvidence = confirmedEvidence.filter(
    (evidence) => typeFilter === "all" || evidence.type === typeFilter,
  );
  const unassignedRecords = useMemo(
    () =>
      (workspace.snapshot?.records ?? [])
        .filter((record) => !record.projectId && record.lifecycle === "active")
        .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn)),
    [workspace.snapshot?.records],
  );
  const caseStudies = (workspace.snapshot?.caseStudies ?? [])
    .filter((item) => item.projectId === projectId)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));

  const today = todayInTimeZone(workspace.snapshot?.settings?.timezone);
  const defaultRangeStart = records.at(-1)?.occurredOn ?? today;
  const defaultRangeEnd = records.at(0)?.occurredOn ?? today;
  const effectiveRangeStart = rangeStart || defaultRangeStart;
  const effectiveRangeEnd = rangeEnd || defaultRangeEnd;
  const rangeEvidence = confirmedEvidence.filter(
    (evidence) =>
      evidence.occurredOn >= effectiveRangeStart &&
      evidence.occurredOn <= effectiveRangeEnd,
  );
  const rangeEvidenceIds = new Set(
    rangeEvidence.map((evidence) => evidence.id),
  );
  const effectiveSelectedEvidenceIds = (
    selectionTouched
      ? selectedEvidenceIds
      : confirmedEvidence.map((evidence) => evidence.id)
  ).filter((id) => rangeEvidenceIds.has(id));

  if (!project) {
    return (
      <section className="page missing-state">
        <p className="eyebrow">项目档案</p>
        <h1>没有找到这个项目。</h1>
        <Link className="button button-secondary" to="/projects">
          返回项目
        </Link>
      </section>
    );
  }
  const activeProject = project;

  function beginProjectEdit() {
    setProjectNameDraft(activeProject.name);
    setProjectDescriptionDraft(activeProject.description ?? "");
    setEditingProject(true);
  }

  async function saveProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      await workspace.updateProject(activeProject.id, {
        name: projectNameDraft,
        description: projectDescriptionDraft,
      });
      setEditingProject(false);
    } finally {
      setSaving(false);
    }
  }

  async function submitCase(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    try {
      const caseStudyId = await workspace.createCaseStudy({
        projectId: activeProject.id,
        title,
        rangeStart: effectiveRangeStart,
        rangeEnd: effectiveRangeEnd,
        includedEvidenceIds: effectiveSelectedEvidenceIds,
      });
      navigate(`/projects/${activeProject.id}/cases/${caseStudyId}`);
    } finally {
      setSaving(false);
    }
  }

  function toggleEvidence(id: string) {
    setSelectionTouched(true);
    setSelectedEvidenceIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  return (
    <section className="page project-detail-page">
      <Link className="back-link" to="/projects">
        ← 项目档案
      </Link>
      <header className="page-header project-detail-header">
        <div>
          <p className="eyebrow">项目脉络</p>
          <h1>{project.name}</h1>
          <p>{project.description ?? "这段工作还没有说明，先从证据开始。"}</p>
        </div>
        <div className="project-detail-actions">
          <span className={`project-status project-status-${project.status}`}>
            {project.status === "archived" ? "已归档" : "可继续沉淀"}
          </span>
          {project.status !== "archived" ? (
            <>
              <button
                className="button button-secondary button-small"
                type="button"
                onClick={beginProjectEdit}
              >
                编辑项目
              </button>
              <button
                className="button button-plain button-small"
                type="button"
                onClick={() => {
                  if (
                    window.confirm(
                      "归档后不会删除记录和证据，确定归档这个项目吗？",
                    )
                  ) {
                    void workspace.archiveProject(activeProject.id);
                  }
                }}
              >
                归档
              </button>
            </>
          ) : null}
        </div>
      </header>

      {editingProject ? (
        <form
          className="project-edit-panel"
          onSubmit={(event) => void saveProject(event)}
        >
          <label className="field">
            <span>项目名称</span>
            <input
              value={projectNameDraft}
              onChange={(event) => setProjectNameDraft(event.target.value)}
              required
            />
          </label>
          <label className="field">
            <span>
              项目说明 <em>可选</em>
            </span>
            <textarea
              value={projectDescriptionDraft}
              onChange={(event) =>
                setProjectDescriptionDraft(event.target.value)
              }
              rows={3}
            />
          </label>
          <div className="case-inline-actions">
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => setEditingProject(false)}
            >
              取消
            </button>
            <button
              className="button button-primary button-small"
              type="submit"
              disabled={saving}
            >
              保存项目
            </button>
          </div>
        </form>
      ) : null}

      <div className="project-detail-layout">
        <div>
          <section className="project-section">
            <div className="section-kicker">
              <h2>项目记录</h2>
              <span className="folio">{records.length} 条</span>
            </div>
            {records.length === 0 ? (
              <div className="source-empty">
                还没有归入这个项目的记录。你可以在记录详情中归档，或从下面的待归档记录开始。
              </div>
            ) : (
              <div className="project-record-list">
                {records.map((record) => (
                  <Link
                    className="project-record-row"
                    key={record.id}
                    to={`/records/${record.id}`}
                  >
                    <time dateTime={record.occurredOn}>
                      {shortDate(record.occurredOn)}
                    </time>
                    <span>{record.originalText}</span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {unassignedRecords.length > 0 ? (
            <section className="project-section">
              <div className="section-kicker">
                <h2>把记录放回项目</h2>
                <span className="folio">待归档</span>
              </div>
              <div className="project-record-list project-record-list-assign">
                {unassignedRecords.slice(0, 8).map((record) => (
                  <div className="project-record-row" key={record.id}>
                    <time dateTime={record.occurredOn}>
                      {shortDate(record.occurredOn)}
                    </time>
                    <span>{record.originalText}</span>
                    <button
                      className="button button-small button-secondary"
                      type="button"
                      onClick={() =>
                        void workspace.assignRecordToProject(
                          record.id,
                          project.id,
                        )
                      }
                    >
                      归入此项目
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <section className="project-section">
            <div className="section-kicker project-evidence-heading">
              <div>
                <h2>已确认证据</h2>
                <p>只有经过你确认的证据，才会进入项目案例的候选范围。</p>
              </div>
              <label className="compact-field">
                <span>类型</span>
                <select
                  value={typeFilter}
                  onChange={(event) =>
                    setTypeFilter(event.target.value as "all" | EvidenceType)
                  }
                >
                  <option value="all">全部</option>
                  {Object.entries(evidenceTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {visibleEvidence.length === 0 ? (
              <div className="source-empty">
                当前范围还没有已确认的证据。先回到记录页整理并确认一条。
              </div>
            ) : (
              <div className="project-evidence-list">
                {visibleEvidence.map((evidence) => (
                  <article className="project-evidence-row" key={evidence.id}>
                    <div>
                      <span className="source-pill">
                        {evidenceTypeLabels[evidence.type]}
                      </span>
                      <time dateTime={evidence.occurredOn}>
                        {shortDate(evidence.occurredOn)}
                      </time>
                    </div>
                    <p>{evidence.statement}</p>
                    <Link
                      to={`/records/${recordIdForEvidence(evidence.id, workspace.snapshot)}`}
                    >
                      查看原始记录 ↗
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          {caseStudies.length > 0 ? (
            <section className="project-section">
              <div className="section-kicker">
                <h2>项目案例</h2>
                <span className="folio">{caseStudies.length} 个</span>
              </div>
              <div className="case-list">
                {caseStudies.map((caseStudy) => (
                  <Link
                    className="case-row"
                    key={caseStudy.id}
                    to={`/projects/${project.id}/cases/${caseStudy.id}`}
                  >
                    <div>
                      <h3>{caseStudy.title}</h3>
                      <p>
                        {caseStudy.rangeStart} — {caseStudy.rangeEnd}
                      </p>
                    </div>
                    <span>
                      {caseStudy.status === "finalized" ? "已定稿" : "草稿"} ↗
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <aside className="case-create-panel">
          <p className="folio">从证据开始写案例</p>
          <h2>建立一份项目案例</h2>
          <p>
            Trace
            只搭好七个事实槽位，不替你编造“能力故事”。每段都要由你写下并确认。
          </p>
          <form
            className="project-form"
            onSubmit={(event) => void submitCase(event)}
          >
            <label className="field">
              <span>案例标题</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：把信息流生产流程做成可复用的工作台"
                required
              />
            </label>
            <div className="form-row project-date-row">
              <label className="field">
                <span>开始</span>
                <input
                  type="date"
                  value={effectiveRangeStart}
                  onChange={(event) => setRangeStart(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>结束</span>
                <input
                  type="date"
                  value={effectiveRangeEnd}
                  onChange={(event) => setRangeEnd(event.target.value)}
                  required
                />
              </label>
            </div>
            <fieldset className="case-evidence-picker">
              <legend>
                纳入证据 · {effectiveSelectedEvidenceIds.length} 条
              </legend>
              {rangeEvidence.length === 0 ? (
                <p>暂无已确认项目证据。</p>
              ) : (
                rangeEvidence.map((evidence) => (
                  <label key={evidence.id}>
                    <input
                      type="checkbox"
                      checked={effectiveSelectedEvidenceIds.includes(
                        evidence.id,
                      )}
                      onChange={() => toggleEvidence(evidence.id)}
                    />
                    <span>{evidence.statement}</span>
                  </label>
                ))
              )}
            </fieldset>
            <button
              className="button button-primary"
              type="submit"
              disabled={saving || rangeEvidence.length === 0}
            >
              {saving ? "正在建立…" : "建立案例草稿"}
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}

function recordIdForEvidence(
  evidenceId: string,
  snapshot: ReturnType<typeof useWorkspace>["snapshot"],
): string {
  const evidence = snapshot?.evidenceItems.find(
    (item) => item.id === evidenceId,
  );
  const citation = snapshot?.citations.find((item) =>
    evidence?.citationIds.includes(item.id),
  );
  return citation?.recordId ?? "";
}
