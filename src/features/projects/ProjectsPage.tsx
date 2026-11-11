import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";

const statusLabels = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档",
} as const;

export function ProjectsPage() {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const projects = workspace.snapshot?.projects ?? [];
  const records = workspace.snapshot?.records ?? [];
  const cases = workspace.snapshot?.caseStudies ?? [];
  const activeProjects = projects.filter(
    (project) => project.status !== "archived",
  );
  const archivedProjects = projects.filter(
    (project) => project.status === "archived",
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const projectId = await workspace.createProject({ name, description });
      setName("");
      setDescription("");
      navigate(`/projects/${projectId}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="page projects-page">
      <header className="page-header projects-header">
        <div>
          <p className="eyebrow">项目档案</p>
          <h1>把证据放回一段脉络</h1>
          <p>
            项目不是任务列表，而是让你回到“当时面对什么、做了什么判断、结果如何”的入口。
          </p>
        </div>
      </header>

      <div className="projects-layout">
        <div className="project-list-column">
          {activeProjects.length === 0 ? (
            <div className="empty-state project-empty-state">
              <p className="folio">第一段脉络</p>
              <h2>先建立一个项目。</h2>
              <p>项目会成为记录、证据和案例之间的稳定容器。</p>
            </div>
          ) : (
            <ProjectList
              title="当前项目"
              projects={activeProjects}
              records={records}
              cases={cases}
            />
          )}

          {archivedProjects.length > 0 ? (
            <ProjectList
              title="已归档"
              projects={archivedProjects}
              records={records}
              cases={cases}
            />
          ) : null}
        </div>

        <aside className="project-create-panel">
          <p className="folio">新建项目</p>
          <h2>给这段工作一个名字</h2>
          <p>
            名字只是索引，不需要现在就写出漂亮的项目简介。后续的证据会慢慢补足它。
          </p>
          <form
            className="project-form"
            onSubmit={(event) => void submit(event)}
          >
            <label className="field">
              <span>项目名称</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="例如：信息流生产管理 MVP"
                required
              />
            </label>
            <label className="field">
              <span>
                一句说明 <em>可选</em>
              </span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="这段工作要解决什么？"
                rows={4}
              />
            </label>
            <button
              className="button button-primary"
              type="submit"
              disabled={saving}
            >
              {saving ? "正在保存…" : "建立项目"}
            </button>
          </form>
        </aside>
      </div>
    </section>
  );
}

function ProjectList({
  title,
  projects,
  records,
  cases,
}: {
  title: string;
  projects: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["projects"];
  records: NonNullable<ReturnType<typeof useWorkspace>["snapshot"]>["records"];
  cases: NonNullable<
    ReturnType<typeof useWorkspace>["snapshot"]
  >["caseStudies"];
}) {
  return (
    <section className="project-section">
      <div className="section-kicker">
        <h2>{title}</h2>
        <span className="folio">{projects.length} 个</span>
      </div>
      <div className="project-list">
        {projects.map((project) => {
          const recordCount = records.filter(
            (record) =>
              record.projectId === project.id && record.lifecycle === "active",
          ).length;
          const caseCount = cases.filter(
            (item) => item.projectId === project.id,
          ).length;
          return (
            <Link
              className="project-row"
              key={project.id}
              to={`/projects/${project.id}`}
            >
              <div className="project-row-main">
                <span className="project-mark" aria-hidden="true" />
                <div>
                  <h3>{project.name}</h3>
                  <p>{project.description ?? "还没有项目说明。"}</p>
                </div>
              </div>
              <div className="project-row-meta">
                <span>{statusLabels[project.status]}</span>
                <span>
                  {recordCount} 条记录 · {caseCount} 个案例
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
