import { Link, useNavigate, useSearchParams } from "react-router";
import { useMemo, useState } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";
import { getWeekRange } from "../../domain/week";
import { todayInTimeZone } from "../../domain/date";
import { formatChineseDate, shortDate } from "../records/recordPresentation";

export function WeekPage() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const weekStartsOn = workspace.snapshot?.settings?.weekStartsOn ?? 1;
  const timezone = workspace.snapshot?.settings?.timezone ?? "Asia/Shanghai";
  const requestedRange = readRequestedRange(searchParams);
  const [weekOffset, setWeekOffset] = useState(0);
  const range = useMemo(
    () =>
      shiftWeek(
        requestedRange ?? getWeekRange(todayInTimeZone(timezone), weekStartsOn),
        weekOffset,
      ),
    [requestedRange, timezone, weekOffset, weekStartsOn],
  );
  const records = useMemo(
    () =>
      (workspace.snapshot?.records ?? [])
        .filter(
          (record) =>
            record.lifecycle === "active" &&
            record.occurredOn >= range.start &&
            record.occurredOn <= range.end,
        )
        .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn)),
    [range.end, range.start, workspace.snapshot?.records],
  );
  const groups = useMemo(
    () => groupRecords(records, workspace.snapshot?.projects ?? []),
    [records, workspace.snapshot?.projects],
  );
  const confirmedEvidence = countEvidence(
    records.map((record) => record.id),
    workspace.snapshot,
    "confirmed",
  );
  const pendingEvidence = countEvidence(
    records.map((record) => record.id),
    workspace.snapshot,
    "proposed",
  );
  const existingReview = workspace.snapshot?.weeklyReviews.find(
    (review) => review.weekStart === range.start,
  );

  function openReport() {
    navigate(`/week/report?weekStart=${range.start}&weekEnd=${range.end}`);
  }

  return (
    <section className="page week-page">
      <header className="page-header week-header">
        <div>
          <p className="eyebrow">本周工作台</p>
          <h1>{formatWeekTitle(range.start, range.end)}</h1>
          <p>
            先按项目回看发生过什么，再把有来源的内容整理成一份真正属于你的周报。
          </p>
        </div>
        <div className="week-actions">
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setWeekOffset((value) => value - 1)}
          >
            ← 上一周
          </button>
          <button
            className="button button-secondary"
            type="button"
            disabled={weekOffset === 0}
            onClick={() => setWeekOffset(0)}
          >
            回到本周
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setWeekOffset((value) => value + 1)}
          >
            下一周 →
          </button>
          <button
            className="button button-primary"
            type="button"
            onClick={openReport}
          >
            {existingReview ? "继续写周报" : "整理本周 / 写周报"}
          </button>
        </div>
      </header>

      <div className="week-summary" aria-label="本周摘要">
        <div>
          <strong>{records.length}</strong>
          <span>条记录</span>
        </div>
        <div>
          <strong>{confirmedEvidence}</strong>
          <span>条已确认证据</span>
        </div>
        <div className={pendingEvidence > 0 ? "has-attention" : undefined}>
          <strong>{pendingEvidence}</strong>
          <span>条待确认</span>
        </div>
        <div>
          <strong>
            {existingReview ? statusLabel(existingReview.status) : "未开始"}
          </strong>
          <span>周报状态</span>
        </div>
      </div>

      {records.length === 0 ? (
        <div className="empty-state week-empty-state">
          <p className="folio">
            {formatChineseDate(range.start)} — {formatChineseDate(range.end)}
          </p>
          <h2>这一周还没有工作记录。</h2>
          <p>先留下一段原话，Trace 才能帮你回看判断和结果。</p>
          <Link className="button button-primary" to="/records">
            去记录一件事
          </Link>
        </div>
      ) : (
        <div className="week-layout">
          <div className="week-groups">
            {groups.map((group) => (
              <section
                className="week-group"
                key={group.id}
                aria-labelledby={`week-group-${group.id}`}
              >
                <header>
                  <div>
                    <p className="folio">项目脉络</p>
                    <h2 id={`week-group-${group.id}`}>{group.name}</h2>
                  </div>
                  <span>{group.records.length} 条记录</span>
                </header>
                <div className="week-record-list">
                  {group.records.map((record) => {
                    const evidence = evidenceForRecord(
                      record.id,
                      workspace.snapshot,
                    );
                    return (
                      <Link
                        className="week-record"
                        to={`/records/${record.id}`}
                        key={record.id}
                      >
                        <time dateTime={record.occurredOn}>
                          {shortDate(record.occurredOn)}
                        </time>
                        <div>
                          <p>{record.originalText}</p>
                          <span>
                            {evidence.confirmed > 0
                              ? `${evidence.confirmed} 条已确认证据`
                              : "尚未确认证据"}
                            {evidence.proposed > 0
                              ? ` · ${evidence.proposed} 条待处理`
                              : ""}
                          </span>
                        </div>
                        <span className="week-record-arrow" aria-hidden="true">
                          ↗
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
          <aside className="week-aside">
            <div className="week-aside-card">
              <p className="folio">本周下一步</p>
              <h2>把记录变成表达</h2>
              <p>
                周报不会自动替你下结论。它会先列出有来源的候选，再由你确认、修改或留空。
              </p>
              <button
                className="button button-primary"
                type="button"
                onClick={openReport}
              >
                {existingReview ? "打开周报草稿" : "开始整理周报"}
              </button>
            </div>
            {pendingEvidence > 0 ? (
              <div className="week-aside-note">
                <strong>还有内容等你确认</strong>
                <span>待确认内容不会自动进入周报正文。</span>
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </section>
  );
}

interface WeekGroup {
  id: string;
  name: string;
  records: NonNullable<ReturnType<typeof useWorkspace>["snapshot"]>["records"];
}

function groupRecords(
  records: WeekGroup["records"],
  projects: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["projects"],
): WeekGroup[] {
  const groups = projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      records: records.filter((record) => record.projectId === project.id),
    }))
    .filter((group) => group.records.length > 0);
  const unassigned = records.filter((record) => !record.projectId);
  if (unassigned.length > 0)
    groups.push({ id: "unassigned", name: "待归档", records: unassigned });
  return groups;
}

function readRequestedRange(
  params: URLSearchParams,
): { start: string; end: string } | undefined {
  const start = params.get("weekStart");
  const end = params.get("weekEnd");
  if (
    !start ||
    !end ||
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(end)
  ) {
    return undefined;
  }
  return { start, end };
}

function evidenceForRecord(
  recordId: string,
  snapshot: ReturnType<typeof useWorkspace>["snapshot"],
) {
  if (!snapshot) return { confirmed: 0, proposed: 0 };
  const citationIds = new Set(
    snapshot.citations
      .filter((citation) => citation.recordId === recordId)
      .map((citation) => citation.id),
  );
  const items = snapshot.evidenceItems.filter((evidence) =>
    evidence.citationIds.some((citationId) => citationIds.has(citationId)),
  );
  return {
    confirmed: items.filter((item) => item.reviewState === "confirmed").length,
    proposed: items.filter((item) => item.reviewState === "proposed").length,
  };
}

function countEvidence(
  recordIds: string[],
  snapshot: ReturnType<typeof useWorkspace>["snapshot"],
  state: "confirmed" | "proposed",
): number {
  return recordIds.reduce(
    (total, recordId) => total + evidenceForRecord(recordId, snapshot)[state],
    0,
  );
}

function shiftWeek(range: { start: string; end: string }, offset: number) {
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + offset * 7);
  end.setUTCDate(end.getUTCDate() + offset * 7);
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function formatWeekTitle(start: string, end: string): string {
  const [, startMonth, startDay] = start.split("-");
  const [, endMonth, endDay] = end.split("-");
  return `${Number(startMonth)} 月 ${Number(startDay)} 日 — ${Number(endMonth)} 月 ${Number(endDay)} 日`;
}

function statusLabel(status: "draft" | "in_review" | "finalized"): string {
  if (status === "finalized") return "已定稿";
  if (status === "in_review") return "待确认";
  return "草稿";
}
