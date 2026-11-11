import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useWorkspace } from "../../app/WorkspaceContext";
import { todayInTimeZone } from "../../domain/date";

export function CaptureSheet({ onClose }: { onClose(): void }) {
  const { snapshot, createRecord, clearError } = useWorkspace();
  const navigate = useNavigate();
  const [occurredOn, setOccurredOn] = useState(() =>
    todayInTimeZone(snapshot?.settings?.timezone),
  );
  const [originalText, setOriginalText] = useState("");
  const [projectId, setProjectId] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [action, setAction] = useState("");
  const [problem, setProblem] = useState("");
  const [currentResult, setCurrentResult] = useState("");
  const [oneLineJudgment, setOneLineJudgment] = useState("");
  const [pending, setPending] = useState(false);
  const [formError, setFormError] = useState<string>();

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFormError(undefined);
    try {
      const id = await createRecord({
        occurredOn,
        originalText,
        ...(projectId ? { projectId } : {}),
        structuredInput: { action, problem, currentResult, oneLineJudgment },
      });
      onClose();
      await navigate(`/records/${id}`);
    } catch (error) {
      clearError();
      const detail =
        error instanceof Error ? error.message.trim() : "发生了未知错误。";
      setFormError(
        `未保存：${detail} 你的输入仍保留在这里，请修改后再次点击“保存记录”。`,
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="sheet-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        className="capture-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="capture-title"
      >
        <header className="sheet-header">
          <div>
            <p className="eyebrow">新建记录</p>
            <h1 id="capture-title">今天发生了什么？</h1>
          </div>
          <button
            className="quiet-button"
            type="button"
            onClick={onClose}
            aria-label="关闭新建记录"
          >
            关闭
          </button>
        </header>

        <form className="capture-form" onSubmit={(event) => void submit(event)}>
          <label className="field field-prominent">
            <span>
              原始文字 <em>唯一必填</em>
            </span>
            <textarea
              autoFocus
              required
              rows={7}
              value={originalText}
              onChange={(event) => setOriginalText(event.target.value)}
              placeholder="不用先总结。写下真实发生的事、你当时注意到的细节，或一句还没想完整的判断。"
            />
          </label>

          <div className="form-row">
            <label className="field">
              <span>发生日期</span>
              <input
                required
                type="date"
                value={occurredOn}
                onChange={(event) => setOccurredOn(event.target.value)}
              />
            </label>
            <label className="field">
              <span>所属项目</span>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                <option value="">暂不归档</option>
                {snapshot?.projects
                  .filter((project) => project.status !== "archived")
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <button
            className="detail-toggle"
            type="button"
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((value) => !value)}
          >
            <span aria-hidden="true">{detailsOpen ? "−" : "+"}</span>
            {detailsOpen ? "收起补充细节" : "补充细节（可选）"}
          </button>

          {detailsOpen ? (
            <div className="detail-fields">
              <label className="field">
                <span>做了什么</span>
                <textarea
                  rows={2}
                  value={action}
                  onChange={(event) => setAction(event.target.value)}
                />
              </label>
              <label className="field">
                <span>遇到的问题</span>
                <textarea
                  rows={2}
                  value={problem}
                  onChange={(event) => setProblem(event.target.value)}
                />
              </label>
              <label className="field">
                <span>当前结果</span>
                <textarea
                  rows={2}
                  value={currentResult}
                  onChange={(event) => setCurrentResult(event.target.value)}
                />
              </label>
              <label className="field">
                <span>一句话判断</span>
                <textarea
                  rows={2}
                  value={oneLineJudgment}
                  onChange={(event) => setOneLineJudgment(event.target.value)}
                />
              </label>
            </div>
          ) : null}

          {formError ? (
            <p className="form-error" role="alert">
              {formError}
            </p>
          ) : null}

          <footer className="form-actions">
            <p>保存后仍可修订；第一版原文会永久保留。</p>
            <div>
              <button
                className="button button-plain"
                type="button"
                onClick={onClose}
              >
                取消
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={pending}
              >
                {pending ? "正在保存…" : "保存记录"}
              </button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
