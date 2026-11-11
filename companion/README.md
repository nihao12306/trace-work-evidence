# Trace 本地伴侣（实验性）

这是 Trace 的可选本地读取进程。它运行在用户自己的电脑上，不是 OAuth 后端，也不会把用户数据发送到 Trace 作者的服务器。

当前版本支持两类只读来源，并统一走“按范围预览—选择—确认”协议：

- 默认绑定 `127.0.0.1:43817`；
- 浏览器请求仅允许来自 Trace 的本机网页地址（端口 4173）；
- Codex 只读 `sessions` 和 `archived_sessions` 里的 JSONL 会话，并只提取用户消息与 Codex 最终消息；
- 飞书只读 `TRACE_FEISHU_EXPORT_DIR` 指向的本地导出/同步目录中的 JSON、Markdown 和文本文件；
- 不读取 `auth.json`、数据库、日志、memory 或其他 Codex 内部文件；
- 不保存 token、refresh token、App Secret 或 Codex 会话凭证；
- `/v1/import/preview` 不会自动连接在线飞书；只有用户运行伴侣并主动请求范围时才读取本地来源；
- `/v1/import/confirm` 只确认本次预览中的已选条目，Trace 收到确认后才写入本地原始记录。

启动：

```bash
node companion/server.mjs
```

## 环境变量

- `TRACE_COMPANION_HOST`：本机监听地址，可选 `127.0.0.1`（默认）或 `localhost`；
- `TRACE_COMPANION_PORT`：监听端口，默认 `43817`；
- `TRACE_CODEX_HOME`：Codex 根目录，默认 `%USERPROFILE%\\.codex`；只读取其中的 `sessions` 和 `archived_sessions`；
- `TRACE_CODEX_SESSIONS_DIR`：可选，直接指定一个 Codex 会话目录，适合测试或自定义安装位置；
- `TRACE_FEISHU_EXPORT_DIR`：飞书本地导出/同步目录；没有它时，飞书来源保持未配置；
- `TRACE_COMPANION_FIXTURE_FILE`：可选的虚构 JSON fixture；配置后用于协议演示，并优先于真实本地来源；
- `TRACE_COMPANION_FIXTURE_JSON`：等价的内联 JSON（适合临时测试，不建议写入 shell 历史）。

## 启动真实本地来源

PowerShell：

```powershell
$env:TRACE_CODEX_HOME = "$env:USERPROFILE\\.codex"
$env:TRACE_FEISHU_EXPORT_DIR = "D:\\path\\to\\your\\feishu-export"
npm run companion
```

Codex 默认可以直接读取本机会话；飞书不能通过这个程序登录账号，必须先把需要读取的文档导出或同步到一个本地目录，再把目录配置给伴侣。

如果只想运行公开演示：

```powershell
$env:TRACE_COMPANION_FIXTURE_FILE = (Resolve-Path .\\companion\\demo-export.json)
npm run companion
```

## 飞书本地材料格式

飞书目录中的 Markdown/文本文件按“一份文件一条原始材料”读取；JSON 可以是数组，也可以是 `{ "items": [...] }` 或 `{ "records": [...] }`。每条 JSON 材料至少需要正文和日期（没有日期时使用文件修改日期），建议提供 `id`、`title`、`url`：

```json
{
  "id": "doc-2026-08-13",
  "title": "一次项目复盘",
  "date": "2026-08-13",
  "content": "我根据反馈调整了入口结构，并记录了还需要验证的问题。",
  "url": "https://example.invalid/doc"
}
```

Codex 会话不需要转换格式；伴侣只提取会话中的用户消息和 Codex 最终消息，生成一条带 `codex://session/...` 定位符的原始材料。

预览请求的 `scope` 支持 `全部`、`最近7天`、`2026-08-01..2026-08-18` 或普通关键词。来源选择会先按来源和范围过滤，避免把材料错标成另一来源。

## 证据整理边界

启动后在 Trace 的“设置与数据 → 本地伴侣”中请求预览。确认导入后，Trace 会把材料保存为原始记录；“生成证据草稿”只提出带原文引用的待确认候选，不会自动写成事实。周报、项目案例和能力主张仍只使用用户确认过的证据。

这不是在线飞书连接器，也不承诺 Codex 内部文件格式永久稳定。若未来增加 OAuth、官方 API 或后台同步，必须另写架构决策，补齐授权范围、撤销、凭证清理和迁移说明。
