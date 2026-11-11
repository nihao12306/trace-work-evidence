import { NavLink, Outlet } from "react-router";
import { WorkspaceProvider, useWorkspace } from "./app/WorkspaceContext";
import { CaptureSheet } from "./features/capture/CaptureSheet";
import { OnboardingPage } from "./features/onboarding/OnboardingPage";

const navigation = [
  { to: "/week", label: "本周" },
  { to: "/records", label: "记录" },
  { to: "/projects", label: "项目" },
  { to: "/career", label: "求职" },
  { to: "/settings", label: "设置与数据" },
] as const;

export function App() {
  return (
    <WorkspaceProvider>
      <WorkspaceGate />
    </WorkspaceProvider>
  );
}

function WorkspaceGate() {
  const workspace = useWorkspace();

  if (workspace.loading && !workspace.snapshot) {
    return (
      <main className="state-page" aria-busy="true">
        <p className="eyebrow">正在打开档案</p>
        <h1>读取保存在这台设备上的工作证据…</h1>
      </main>
    );
  }

  if (workspace.error && !workspace.snapshot) {
    return (
      <main className="state-page" role="alert">
        <p className="eyebrow">没有成功打开</p>
        <h1>本地档案暂时无法读取。</h1>
        <p className="muted-copy">{workspace.error}</p>
        <button
          className="button button-primary"
          type="button"
          onClick={() => void workspace.refresh()}
        >
          再试一次
        </button>
      </main>
    );
  }

  if (!workspace.snapshot?.settings) {
    return <OnboardingPage />;
  }

  return <ApplicationShell />;
}

function ApplicationShell() {
  const { captureOpen, closeCapture, openCapture, error, clearError } =
    useWorkspace();

  return (
    <div className="app-frame">
      <header className="app-header">
        <NavLink
          className="wordmark"
          to="/records"
          aria-label="Trace 迹，工作证据册"
        >
          <span>Trace</span>
          <span className="wordmark-separator" aria-hidden="true" />
          <span>迹</span>
        </NavLink>
        <p>工作证据册</p>
        <button
          className="button button-primary capture-trigger"
          type="button"
          onClick={openCapture}
        >
          新建记录
        </button>
      </header>

      <aside className="app-sidebar" aria-label="主要导航">
        <nav>
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `nav-link${isActive ? " is-active" : ""}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-note">
          <span className="status-dot" aria-hidden="true" />
          <span>数据仅保存在当前浏览器</span>
        </div>
      </aside>

      <main className="app-main">
        {error ? (
          <div className="inline-alert" role="alert">
            <span>{error}</span>
            <button type="button" onClick={clearError}>
              关闭
            </button>
          </div>
        ) : null}
        <Outlet />
      </main>

      <nav className="mobile-nav" aria-label="移动端主要导航">
        {navigation.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `mobile-nav-link${isActive ? " is-active" : ""}`
            }
          >
            {item.label === "设置与数据" ? "设置" : item.label}
          </NavLink>
        ))}
      </nav>

      {captureOpen ? <CaptureSheet onClose={closeCapture} /> : null}
    </div>
  );
}
