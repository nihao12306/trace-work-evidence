import { useState } from "react";
import { Link } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";
import { shortDate } from "./recordPresentation";
import { countRecordEvidence } from "./recordPresentation";

export function RecordsPage() {
  const { snapshot, openCapture } = useWorkspace();
  const [showArchived, setShowArchived] = useState(false);
  const allRecords = [...(snapshot?.records ?? [])].sort((left, right) =>
    right.occurredOn.localeCompare(left.occurredOn),
  );
  const records = allRecords.filter((record) => record.lifecycle === "active");
  const archivedRecords = allRecords.filter(
    (record) => record.lifecycle === "archived",
  );
  const projects = snapshot?.projects ?? [];
  const evidenceCounts = countRecordEvidence(
    snapshot?.citations ?? [],
    snapshot?.evidenceItems ?? [],
  );

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

  return (
    <section className="page records-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">原始档案</p>
          <h1>记录</h1>
          <p>保留当时的原话，再从中整理出可验证的行动、判断与结果。</p>
        </div>
        <div className="records-header-actions">
          <button
            className="button button-secondary desktop-action"
            type="button"
            onClick={openCapture}
          >
            写一条记录
          </button>
          {archivedRecords.length > 0 ? (
            <button
              className="button button-plain button-small archived-toggle"
              type="button"
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived
                ? "隐藏已归档"
                : `查看已归档（${archivedRecords.length}）`}
            </button>
          ) : null}
        </div>
      </header>

      {records.length === 0 && !showArchived ? (
        <div className="empty-state">
          <p className="folio">空白工作册</p>
          <h2>不必从完整复盘开始。</h2>
          <p>
            先记下一件今天真实发生的事。原始文字是唯一必填项，之后再慢慢整理。
          </p>
          <button
            className="button button-primary"
            type="button"
            onClick={openCapture}
          >
            写下第一条记录
          </button>
        </div>
      ) : (
        <div className="record-groups">
          {groups.map((group) => (
            <section
              className="record-group"
              key={group.id}
              aria-labelledby={`group-${group.id}`}
            >
              <header>
                <h2 id={`group-${group.id}`}>{group.name}</h2>
                <span>{group.records.length} 条记录</span>
              </header>
              <div className="record-list">
                {group.records.map((record) => {
                  const evidenceCount = evidenceCounts.get(record.id) ?? 0;
                  return (
                    <Link
                      className="record-row"
                      key={record.id}
                      to={`/records/${record.id}`}
                    >
                      <time dateTime={record.occurredOn}>
                        {shortDate(record.occurredOn)}
                      </time>
                      <p>{record.originalText}</p>
                      <span className="evidence-count">
                        {evidenceCount > 0
                          ? `${evidenceCount} 条证据`
                          : "尚未整理"}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </section>
          ))}
          {showArchived && archivedRecords.length > 0 ? (
            <section className="record-group record-group-archived">
              <header>
                <h2>已归档</h2>
                <span>{archivedRecords.length} 条记录</span>
              </header>
              <div className="record-list">
                {archivedRecords.map((record) => (
                  <Link
                    className="record-row"
                    key={record.id}
                    to={`/records/${record.id}`}
                  >
                    <time dateTime={record.occurredOn}>
                      {shortDate(record.occurredOn)}
                    </time>
                    <p>{record.originalText}</p>
                    <span className="evidence-count">已归档</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </section>
  );
}
