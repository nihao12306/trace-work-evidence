# Trace 状态故事与视觉验收

这份记录把“页面能打开”之外的状态固定下来，避免空状态、加载中和错误状态被当作次要细节。状态故事使用虚构数据，不读取外部来源。

| 状态       | 入口/触发                            | 用户看到的边界                                     | 证据                                                                 |
| ---------- | ------------------------------------ | -------------------------------------------------- | -------------------------------------------------------------------- |
| 首次使用   | 清空浏览器工作册后打开 `/`           | 先说明本地存储和证据原则，再选择空白或演示数据     | `src/App.test.tsx`；`phase-2-first-use-empty-1440x900.png`           |
| 加载中     | IndexedDB 打开尚未完成               | 显示“正在打开档案”和 `aria-busy`，不渲染半成品页面 | `src/App.test.tsx`：`keeps a visible loading state`                  |
| 存储错误   | IndexedDB 打开抛出额度错误或迁移错误 | 显示可理解的错误、保留重试入口，不显示伪成功       | `src/App.test.tsx`：`explains a storage error`                       |
| 空记录     | 从空白开始后进入“记录”               | 明确提示“先记下一件真实发生的事”，只有一个主行动   | `phase-6-state-empty-records-1440x900.png`                           |
| 空周       | 空工作册进入“本周”                   | 不生成泛化成绩，提供回到记录页的入口               | `phase-6-state-empty-week-1440x900.png`                              |
| 空项目     | 空工作册进入“项目”                   | 解释项目是证据容器，同时保留建立项目表单           | `phase-6-state-empty-projects-1440x900.png`                          |
| 来源离线   | 设置页检查未运行的本地伴侣           | 明确伴侣未运行，但手动记录和文件导入仍可用         | `phase-6-state-companion-offline-1440x900.png`                       |
| 导入错误   | 选择无法解析的 JSON                  | 错误显示在数据管理区域，原工作册不被修改           | `phase-6-state-import-error-1440x900.png`                            |
| 长文本     | 记录中输入长中文和连续 URL           | 文字换行、页面不产生意外横向滚动                   | `tests/e2e/smoke.spec.ts`；`phase-2-long-chinese-record-390x844.png` |
| 待确认证据 | 原文提炼或演示 AI                    | 候选显示待确认、来源和作者；用户可编辑、确认或拒绝 | `tests/e2e/smoke.spec.ts`；`phase-2-evidence-proposal-360x800.png`   |

浏览器样张由 `tests/e2e/state-stories.spec.ts` 生成，桌面状态使用 `1440×900`。加载与存储故障属于 IndexedDB 时序，使用应用级测试锁定，不依赖截图碰运气。
