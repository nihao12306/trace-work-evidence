import { useState } from "react";
import { useWorkspace } from "../../app/WorkspaceContext";

export function OnboardingPage() {
  const { initializeDemo, initializeEmpty } = useWorkspace();
  const [pending, setPending] = useState<"empty" | "demo">();

  async function start(mode: "empty" | "demo") {
    setPending(mode);
    try {
      if (mode === "demo") await initializeDemo();
      else await initializeEmpty();
    } finally {
      setPending(undefined);
    }
  }

  return (
    <main className="onboarding-page">
      <header className="onboarding-header">
        <div className="wordmark" aria-label="Trace 迹">
          <span>Trace</span>
          <span className="wordmark-separator" aria-hidden="true" />
          <span>迹</span>
        </div>
        <span>工作证据册</span>
      </header>

      <section className="onboarding-copy" aria-labelledby="onboarding-title">
        <p className="eyebrow">先留下真实发生的事</p>
        <h1 id="onboarding-title">让工作的来路，留在结论旁边。</h1>
        <p>
          Trace 把散落的工作痕迹沉淀成可以回看、验证和使用的个人证据。
          它不会替你发明成绩，也不会要求你一开始就完成一篇复盘。
        </p>
      </section>

      <section className="onboarding-choices" aria-label="选择开始方式">
        <article className="start-card start-card-primary">
          <p className="folio">你的工作册</p>
          <h2>从一条真实记录开始</h2>
          <p>创建一个空白、本地保存的工作证据册。之后可以随时导出或清空。</p>
          <button
            className="button button-primary"
            type="button"
            disabled={pending !== undefined}
            onClick={() => void start("empty")}
          >
            {pending === "empty" ? "正在创建…" : "从空白开始"}
          </button>
        </article>

        <article className="start-card">
          <p className="folio">完整示例</p>
          <h2>先看看证据如何生长</h2>
          <p>载入虚构演示数据，查看记录、来源、结果和能力主张之间的关系。</p>
          <button
            className="button button-secondary"
            type="button"
            disabled={pending !== undefined}
            onClick={() => void start("demo")}
          >
            {pending === "demo" ? "正在载入…" : "载入演示工作册"}
          </button>
        </article>
      </section>

      <footer className="privacy-note">
        <strong>本地优先</strong>
        <span>
          当前版本不需要登录，数据默认只保存在这台设备的浏览器中；清理浏览器数据可能导致丢失。设置与数据页会提供备份入口。
        </span>
      </footer>
    </main>
  );
}
