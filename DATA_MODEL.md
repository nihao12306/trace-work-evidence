# Trace / 迹：数据模型 v0.1

> 目标：支持“原始记录 → 证据 → 周报/案例结论”的完整来源链，同时保持本地优先、可迁移、无 AI 也可用。本文定义领域语义，不绑定某个 IndexedDB 库。

## 1. 建模原则

1. **原始材料与派生内容分离**：原始记录、证据、输出内容块是不同实体，不能用一个富文本字段混装。
2. **内容类型与可信状态分离**：行动/结果等回答“它在说什么”，事实/判断/推测等回答“我们如何知道”。
3. **来源引用是一等实体**：引用可被验证、失效和修复，不是显示用字符串。
4. **AI 只生产候选**：模型调用不能直接写入已确认事实或已定稿输出。
5. **用户确认不改写历史**：定稿、确认和原文修订都保留必要历史。
6. **本地数据可带走**：所有持久化对象有稳定 ID、时间戳、schema 版本和 JSON 表达。
7. **最少收集**：不为了未来可能用到而保存完整模型请求、设备指纹或行为分析数据。

## 2. 三层领域结构

```text
材料层                         证据层                         表达层
SourceRecord + revisions  ->  EvidenceItem + citations  ->  WeeklyReview / CaseStudy
用户当时留下了什么             从材料中可主张什么              这次要如何组织与表达
```

任何表达层中的事实性内容，必须沿 `OutputBlock/CapabilityClaim → Citation/EvidenceItem → SourceRecord` 回到材料层。

## 3. 通用类型

以下 TypeScript 仅表达拟定语义，开发时可根据验证库调整，但字段含义和不变量不可静默改变。

```ts
type EntityId = string; // 建议使用 UUID v4 或同等随机 ID
type ISODate = string; // YYYY-MM-DD，表示用户语义日期
type ISODateTime = string; // 带时区的 ISO 8601 时间

interface EntityMeta {
  id: EntityId;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  schemaVersion: number;
}

type AuthorKind = "user" | "ai" | "system";
type ReviewState = "draft" | "proposed" | "confirmed" | "rejected";

type EpistemicKind =
  "observed_fact" | "user_judgment" | "ai_inference" | "hypothesis";
```

说明：

- `ReviewState` 表示用户工作流状态；`EpistemicKind` 表示内容的认识论身份。二者不能互相推导。
- `confirmed + ai_inference` 合法，含义是“用户确认保留这条 AI 推测”，不是“它已变成事实”。
- “最终结果”由证据类型与结果阶段共同表达，不新增一个会与事实状态冲突的万能枚举。

## 4. 核心实体

### 4.1 WorkspaceSettings

第一版只有一个本地工作册，但仍保存其设置和数据格式信息。

```ts
interface WorkspaceSettings extends EntityMeta {
  displayName: string;
  locale: "zh-CN";
  timezone: string; // 默认 Asia/Shanghai
  weekStartsOn: 1 | 0; // 1=周一，0=周日
  aiMode: "off" | "demo" | "custom_endpoint";
  aiEndpointConfig?: {
    endpoint: string;
    modelLabel?: string;
    // 不在持久化导出中保存明文 secret
  };
  careerProfile?: {
    currentRole: string;
    targetDirections: string;
    preferredWork: string;
    constraints: string;
    dealBreakers: string;
    updatedAt: ISODateTime;
  };
  demoDataLoaded: boolean;
}
```

`careerProfile` 只保存用户主动填写的事实与筛选条件。历史字段 `targetDirections` 在界面中表示用户对系统推导方向的反馈，不是要求用户预先提交目标岗位。它属于本地工作册和 JSON 备份，不包含系统推导出的岗位候选，也不能改变证据或能力主张的确认状态。

岗位方向候选由已确认 `EvidenceItem`、已确认 `CapabilityClaim` 和项目上下文即时计算，不持久化。候选至少需要两个相互支持的来源和两类重复工作信号；它只能标注为“初步线索”或“较强线索”，不得被保存为事实、能力评分或最终职业结论。

求职页的自动发现仍复用 `CompanionImportPreview → ImportBatch → SourceRecord → proposed EvidenceItem` 链路。扫描预览只存在于本地伴侣内存和当前页面状态；用户确认前不写入工作册。自动整理出的工作信号必须保留 `Citation`，初始为 `proposed`，不得直接参与岗位方向推导。

### 4.2 Project

```ts
interface Project extends EntityMeta {
  name: string;
  description?: string;
  status: "active" | "paused" | "completed" | "archived";
  startedOn?: ISODate;
  endedOn?: ISODate;
  colorToken?: "clay" | "moss" | "slate" | "ochre";
}
```

约束：

- `name` 去除首尾空白后必须非空；名称可重复，ID 才是主键。
- 删除有引用的项目时默认转为 `archived`；不级联删除记录和证据。

### 4.3 SourceRecord

原始工作碎片。`originalText` 是首次正式保存的内容；后续修改写入修订，不覆盖它。

```ts
interface SourceRecord extends EntityMeta {
  occurredOn: ISODate;
  projectId?: EntityId;
  originalText: string;
  originalStructuredInput?: StructuredRecordFields;
  currentRevisionId: EntityId;
  sourceLabel?: string; // 用户可见标签，如“会后手记”
  sourceAttribution?: SourceAttribution;
  lifecycle: "active" | "archived" | "trashed";
}

interface StructuredRecordFields {
  action?: string;
  problem?: string;
  currentResult?: string;
  oneLineJudgment?: string;
}

type SourceOriginKind =
  "manual" | "file_import" | "feishu_document" | "codex_task";

interface SourceAttribution {
  origin: SourceOriginKind;
  providerLabel: string; // 例如“手动记录”“飞书文档”“Codex 任务”
  externalId?: string; // 供应商对象 ID，不是 token 或 secret
  locator?: string; // 用户可见定位信息；可在导出前脱敏
  importedAt?: ISODateTime;
  importBatchId?: EntityId;
}

interface RecordRevision extends EntityMeta {
  recordId: EntityId;
  revisionNumber: number;
  text: string;
  structuredInput?: StructuredRecordFields;
  changeNote?: string;
  author: "user";
}
```

约束：

- 创建正式记录时，`originalText.trim().length > 0`。
- 第一条 `RecordRevision.text` 与 `originalText` 相同、其结构化字段与 `originalStructuredInput` 相同，修订号从 1 开始；当前展示从 `currentRevisionId` 指向的修订读取，避免两份“当前值”漂移。
- 一条记录最多属于一个项目；无项目即进入待归档视图。
- 被引用的修订不可物理删除。

### 4.4 ImportBatch

一次用户确认的外部或文件导入。它记录“这批材料从哪里、按什么范围进入工作册”，但绝不保存访问令牌。

```ts
type ImportProvider = "local_file" | "feishu" | "codex";

interface ImportBatch extends EntityMeta {
  provider: ImportProvider;
  transport: "file_picker" | "local_companion";
  scopeSummary: string; // 人类可读的范围，如“2026-08-01 至 2026-08-07”
  selectedCount: number;
  importedCount: number;
  status: "preview" | "confirmed" | "rejected" | "failed";
  failureMessage?: string;
}
```

约束：

- `status=confirmed` 前，批次中的材料只能停留在内存预览，不得写入正式 `SourceRecord`。
- `selectedCount` 是用户在预览中看到并选择的数量；`importedCount` 是实际写入的数量，两者不一致时必须说明原因。
- `scopeSummary` 不替代供应商授权范围；它只记录这次 Trace 导入的用户可读边界。
- `ImportBatch`、`SourceAttribution` 和来源引用不代表内容已经被验证；导入材料仍需经过证据候选与用户确认。
- 设置页可以按批次移除未被引用的本地副本；如果任一记录的修订已被有效 `Citation` 引用，该记录与批次会保留，并在删除前展示影响引用。这个操作不等同于断开外部授权。

### 4.5 EvidenceItem

对一条或多条材料的最小可确认主张。

```ts
type EvidenceType =
  | "action"
  | "problem"
  | "decision"
  | "result"
  | "feedback"
  | "learning"
  | "hypothesis";

interface EvidenceItem extends EntityMeta {
  projectId?: EntityId;
  occurredOn: ISODate;
  type: EvidenceType;
  statement: string;
  epistemicKind: EpistemicKind;
  reviewState: ReviewState;
  resultStage?: "interim" | "final"; // 只允许 type=result
  authoredBy: AuthorKind;
  aiRunId?: EntityId;
  confirmedAt?: ISODateTime;
  confirmedByUser: boolean;
  rejectionReason?: string;
  citationIds: EntityId[];
}
```

关键不变量：

- `statement` 非空，表示一条可复用的证据表达，不等同于原文摘录；原文依据必须通过 `Citation.quoteSnapshot` 保留。
- 原始文字候选可以对多个相邻片段进行低风险合并，但表达不得超出引用支持的范围；用户确认的是这条表达是否准确，不是对原文重新投票。
- 旧版仅把原文摘录当作 `statement` 的候选不会被静默迁移；用户主动重整并确认影响后，允许在同一有效引用范围内改写表达，原有确认状态与来源关系继续保留。
- 除用户纯主观补充的 `user_judgment` 外，进入 `confirmed` 前至少有一条有效引用；周报/案例事实性使用时一律需要引用。
- `authoredBy=ai` 时初始 `reviewState` 必须是 `proposed`，`confirmedByUser=false`。
- `epistemicKind=ai_inference` 不能因确认自动改为 `observed_fact`。
- `type=hypothesis` 时 `epistemicKind` 必须为 `hypothesis`；反向亦然，避免两套假设语义分叉。
- `resultStage` 仅用于 `type=result`；最终结果仍需确认和引用。
- 被拒绝的证据默认不参与新输出生成，但保留审计历史。

不在 `EvidenceItem` 上增加必填的“用途”枚举。证据是否被用于周报、项目案例或能力主张，应从 `OutputBlock.citationIds` 与 `CapabilityClaim` 的反向关系计算；这样同一证据可以服务多个输出，也不会在快速记录时迫使用户预判未来用途。“可能用于本周结果”等建议可以由界面临时计算或由 AI 提议，但不作为事实字段持久化。

### 4.6 Citation

```ts
interface Citation extends EntityMeta {
  targetKind: "source_record_revision" | "evidence_item";
  targetId: EntityId;
  recordId?: EntityId; // target 为 revision 时便于回到记录
  quoteSnapshot: string;
  fieldPath?: string; // 如 structuredInput.currentResult
  charRange?: { start: number; end: number };
  validity: "valid" | "stale" | "missing";
}
```

设计说明：

- `quoteSnapshot` 必填，保证来源改版后仍能理解当时引用了什么。
- `charRange` 是定位增强，不是唯一依据；中文 Unicode、空格规范化或修订后范围可能失效。
- 指向 `EvidenceItem` 的二级引用必须能够继续追溯到至少一条 `SourceRecord` 引用，禁止循环引用。

### 4.7 WeeklyReview

```ts
type WeeklySectionKey =
  | "focus"
  | "results"
  | "went_well"
  | "problems"
  | "supported_causes"
  | "inferred_causes"
  | "next_validations"
  | "personal_reflection";

interface WeeklyReview extends EntityMeta {
  weekStart: ISODate;
  weekEnd: ISODate;
  timezone: string;
  status: "draft" | "in_review" | "finalized";
  currentRevisionId: EntityId;
  finalizedAt?: ISODateTime;
}

interface WeeklyReviewRevision extends EntityMeta {
  weeklyReviewId: EntityId;
  revisionNumber: number;
  statusSnapshot: WeeklyReview["status"];
  blockIds: EntityId[];
  createdBy: "user" | "system";
}
```

每个自然周只存在一个逻辑 `WeeklyReview`，可有多个修订版本。改变时区或周起始日后，不静默重写既有周报边界。

### 4.8 OutputBlock

周报和项目案例复用的语义内容块。

```ts
type CaseSectionKey =
  | "background"
  | "problem"
  | "judgment"
  | "action"
  | "iteration"
  | "result"
  | "capability";

interface OutputBlock extends EntityMeta {
  ownerKind: "weekly_review_revision" | "case_study_revision";
  ownerId: EntityId;
  sectionKey: WeeklySectionKey | CaseSectionKey;
  order: number;
  content: string;
  epistemicKind: EpistemicKind;
  reviewState: ReviewState;
  authoredBy: AuthorKind;
  authorshipNote?: "user_written" | "ai_drafted" | "ai_drafted_user_edited";
  citationIds: EntityId[];
  aiRunId?: EntityId;
  capabilityClaimId?: EntityId; // 仅用于 sectionKey=capability，确认沉淀后建立
}
```

约束：

- AI 生成块初始为 `proposed`。
- `supported_causes` 只允许含有效引用的 `observed_fact` 或有明确证据链的 `user_judgment`。
- `inferred_causes` 必须为 `ai_inference`、`hypothesis` 或用户明确标注的 `user_judgment`，界面不可将其呈现为事实。
- `personal_reflection` 可没有外部事实引用，但必须由用户创建或明确确认；AI 只能建议表达。
- `capability` 至少引用一条有效的已确认行动/决策证据；若声称效果还须引用结果或反馈证据。当前案例定稿会阻止没有行为/判断来源的能力段落，效果语义的细粒度校验仍留在能力主张阶段。
- 能力块在案例中可以作为“能力线索”保留；只有用户主动选择沉淀、且证明链满足约束时，才创建或关联 `CapabilityClaim`。
- 定稿修订中不能存在 `proposed` 块；`rejected` 块不进入正文导出。

### 4.9 ValidationPlan

用于把推测转成下一步可验证事项，但不是通用待办。

```ts
interface ValidationPlan extends EntityMeta {
  hypothesisEvidenceId: EntityId;
  question: string;
  validationAction: string;
  expectedSignal?: string;
  targetDate?: ISODate;
  status: "planned" | "observed" | "closed";
  outcomeEvidenceId?: EntityId;
}
```

边界：它只服务某条假设的验证闭环，不提供优先级、提醒、重复任务、负责人或任务看板。

### 4.10 CaseStudy

```ts
interface CaseStudy extends EntityMeta {
  projectId: EntityId;
  title: string;
  rangeStart: ISODate;
  rangeEnd: ISODate;
  includedEvidenceIds: EntityId[];
  excludedEvidenceIds: EntityId[];
  status: "draft" | "in_review" | "finalized";
  currentRevisionId: EntityId;
  finalizedAt?: ISODateTime;
}

interface CaseStudyRevision extends EntityMeta {
  caseStudyId: EntityId;
  revisionNumber: number;
  blockIds: EntityId[];
  createdBy: "user" | "system";
}
```

### 4.11 CapabilityClaim

能力不是 `EvidenceType`，而是由多条证据支持的一项用户主张。第一版从项目案例的“形成的能力”块中创建单项目能力主张；跨项目聚合属于后续使用方式，但数据结构保留来源链。

```ts
interface CapabilityClaim extends EntityMeta {
  title: string; // 如“在信息不完整时推进跨团队决策”
  statement: string;
  scope: "single_project" | "cross_project";
  reviewState: ReviewState;
  authoredBy: AuthorKind;
  aiRunId?: EntityId;
  context: string; // 情境、目标与约束，不是能力形容词
  behaviorEvidenceIds: EntityId[]; // 判断、决策、行动
  outcomeEvidenceIds: EntityId[]; // 结果
  feedbackEvidenceIds: EntityId[]; // 外部反馈，可为空
  caseStudyIds: EntityId[];
  limitations?: string; // 当前证据不能证明什么
}
```

约束：

- AI 只能创建 `proposed` 能力主张，不能自动确认。
- `confirmed` 能力主张至少包含一条行动或决策证据、一条结果或反馈证据，以及一个项目案例。
- 所有关联证据必须继续追溯到原始记录；不能只引用另一句能力总结。
- `scope=single_project` 只能表述“在该案例中有证据支持”，不能使用“长期稳定”“持续擅长”等跨场景措辞。
- `scope=cross_project` 至少关联两个不同项目的已定稿案例，且每个案例均包含行为与结果/反馈链；第一版不提供创建该范围主张的界面。
- 证据数量不转换成能力分数、等级或百分比。
- 缺少结果/反馈时，内容只能作为案例中的“能力线索”或待验证判断保留，不能确认成 `CapabilityClaim`。

未来生成简历时，应先选择能力主张和目标岗位，再从其关联案例中组织表达；不得直接把零散证据批量改写成简历成绩。

### 4.12 AiRun

记录可解释和复现所需的最少信息，不保存密钥。

```ts
interface AiRun extends EntityMeta {
  task:
    | "extract_evidence"
    | "draft_weekly_review"
    | "draft_case_study"
    | "rewrite_block";
  adapter: "demo" | "custom_endpoint";
  modelLabel: string;
  promptVersion: string;
  inputRefs: Array<{ kind: string; id: EntityId; revisionId?: EntityId }>;
  status: "running" | "succeeded" | "failed" | "cancelled";
  startedAt: ISODateTime;
  completedAt?: ISODateTime;
  errorCode?: string;
  outputEntityIds: EntityId[];
}
```

AI 适配器返回结构化候选，不直接操作数据库：

```ts
interface AiAdapter {
  extractEvidence(input: ExtractEvidenceInput): Promise<EvidenceProposal[]>;
  draftWeeklyReview(input: WeeklyReviewInput): Promise<OutputBlockProposal[]>;
  draftCaseStudy(input: CaseStudyInput): Promise<OutputBlockProposal[]>;
  rewriteBlock(input: RewriteBlockInput): Promise<OutputBlockProposal>;
}
```

写入由领域服务统一校验：引用存在、类型合法、AI 初始状态为候选、错误可恢复。

## 5. 关系与删除策略

```text
Project 0..1 <--- SourceRecord 1 ---* RecordRevision
                         ^                 ^
                         |                 |
                         +---- Citation ---+
                                  ^
                                  |
EvidenceItem * -------------------+---* Citation
     ^                                      ^
     |                                      |
     +--- ValidationPlan             OutputBlock * ---0..1 CapabilityClaim
     |                                      |
     +---------------- CapabilityClaim *     |
                                             |
                       WeeklyReviewRevision / CaseStudyRevision
```

删除策略：

- 普通删除先进入 `trashed` 或归档，不立即物理删除。
- 有引用的记录、修订、证据和定稿输出不可单独物理删除。
- 移除导入批次时，只物理删除完全没有来源引用的记录及修订；即使引用已过期或标记为缺失，只要仍指向该修订也保留，避免备份留下断裂关系；批次的 `importedCount` 更新为保留数量。
- 已被能力主张采用的证据或案例不可在普通删除中破坏引用；能力主张可归档，不能通过删除来源让它看起来仍被支持。
- “清空全部数据”是唯一允许整体物理删除的首版入口，需二次确认并建议备份。
- 项目归档不会删除其内容；恢复后引用关系不变。
- 导入发生 ID 冲突时，默认拒绝并给出可理解错误；首版不做复杂合并。

## 6. IndexedDB 存储建议

建议对象仓库：

| Store                   | 主键 | 常用索引                                                                   |
| ----------------------- | ---- | -------------------------------------------------------------------------- |
| `workspaceSettings`     | `id` | 无                                                                         |
| `projects`              | `id` | `status`, `updatedAt`                                                      |
| `sourceRecords`         | `id` | `occurredOn`, `projectId`, `[projectId+occurredOn]`, `lifecycle`           |
| `recordRevisions`       | `id` | `recordId`, `[recordId+revisionNumber]`                                    |
| `importBatches`         | `id` | `provider`, `status`, `createdAt`                                          |
| `evidenceItems`         | `id` | `occurredOn`, `projectId`, `type`, `reviewState`, `[projectId+occurredOn]` |
| `citations`             | `id` | `targetId`, `recordId`, `validity`                                         |
| `weeklyReviews`         | `id` | `weekStart`, `status`                                                      |
| `weeklyReviewRevisions` | `id` | `weeklyReviewId`, `[weeklyReviewId+revisionNumber]`                        |
| `caseStudies`           | `id` | `projectId`, `status`                                                      |
| `caseStudyRevisions`    | `id` | `caseStudyId`, `[caseStudyId+revisionNumber]`                              |
| `outputBlocks`          | `id` | `ownerId`, `[ownerId+sectionKey]`, `reviewState`                           |
| `capabilityClaims`      | `id` | `scope`, `reviewState`, `updatedAt`                                        |
| `validationPlans`       | `id` | `hypothesisEvidenceId`, `status`                                           |
| `aiRuns`                | `id` | `task`, `status`, `createdAt`                                              |

实现要求：

- 跨多个 store 的写入使用单一事务，例如“确认 AI 候选 + 更新时间 + 建立引用”。
- 数据库升级必须通过显式迁移，不在组件渲染时临时修字段。
- UI 不直接调用 IndexedDB；通过 repository + domain service，便于测试和未来迁移。
- 浏览器存储额度不足、数据库被阻止或迁移失败时，展示可恢复的错误状态，不假装保存成功。

## 7. 导出与导入格式

### 7.1 全量 JSON 备份

```ts
interface TraceBackup {
  format: "trace-backup";
  formatVersion: number;
  exportedAt: ISODateTime;
  appVersion: string;
  checksum?: string;
  data: {
    workspaceSettings: WorkspaceSettings[];
    projects: Project[];
    sourceRecords: SourceRecord[];
    recordRevisions: RecordRevision[];
    importBatches: ImportBatch[];
    evidenceItems: EvidenceItem[];
    citations: Citation[];
    weeklyReviews: WeeklyReview[];
    weeklyReviewRevisions: WeeklyReviewRevision[];
    caseStudies: CaseStudy[];
    caseStudyRevisions: CaseStudyRevision[];
    outputBlocks: OutputBlock[];
    capabilityClaims: CapabilityClaim[];
    validationPlans: ValidationPlan[];
    aiRuns: AiRun[];
  };
}
```

导入流程必须先在内存中完成格式校验、版本检查和引用完整性检查，再以事务写入。任何一步失败不得留下半份数据。

明文 secret、会话令牌、浏览器环境信息不进入备份。

### 7.2 Markdown / HTML 表达导出

- 只导出当前选定修订，不把已拒绝候选混入正文。
- 默认在文末生成“证据索引”，用稳定短编号对应日期、项目和摘录。
- AI 身份可选择保留为注释，但事实/推测/假设的语义标签不可被导出模板抹掉。
- HTML 使用内联或随文可用的打印样式，不依赖运行中的应用路由。

## 8. 演示数据要求

演示数据必须完全虚构，覆盖：

- 3 个项目：进行中、已完成、暂停各一个；
- 至少 2 个自然周；
- 未归项目记录；
- 七类证据；
- 原始记录修订；
- 已确认事实、用户判断、AI 推测、待验证假设和最终结果；
- 已确认、待确认、已拒绝三种整理结果；
- 一份草稿周报、一份已定稿周报；
- 一份包含迭代和能力候选的项目案例；
- 一条证据链完整的单项目能力主张，以及一条因缺少结果而只能保留为线索的对照样本；
- 引用失效的可控错误样本（仅用于测试/故事页，不出现在默认正常流程）；
- 长中文项目名、长段落和空字段。

演示数据生成应使用固定 seed 或静态 fixture，保证截图、测试和公开演示可复现。

## 9. 关键领域测试

开发时至少为以下 17 条不变量编写自动测试：

1. AI 生成的证据和输出块不能初始为 `confirmed`。
2. 确认 `ai_inference` 不会把它改成 `observed_fact`。
3. 事实性输出缺少有效引用时不能定稿。
4. 引用可从输出块追溯到具体记录修订与摘录。
5. 修订原始记录后，旧引用保留摘录并标为有效或过期，而不是静默换文。
6. 假设类型与假设认识论身份保持一致。
7. 非结果证据不能设置 `resultStage`。
8. 被拒绝内容不进入新生成输入和正文导出。
9. 周报边界遵循创建时保存的时区与周起始日。
10. JSON 导入校验失败时不产生部分写入。
11. JSON 备份不包含密钥字段。
12. 定稿产生新修订，旧定稿仍可读取。
13. 能力主张缺少行动/决策或结果/反馈证据时不能确认。
14. 单项目能力主张不能被导出为跨项目长期稳定能力。
15. 未确认的 `ImportBatch` 只能存在于预览态，不写入正式材料层。
16. 导入材料必须保留 `SourceAttribution`；来源标签缺失时不得伪装成手动记录。
17. `TraceBackup` 不包含飞书 token、Codex 会话凭证或本地伴侣秘密；导入来源元数据也应在导出前允许用户检查和脱敏。

## 10. 暂缓建模的能力

第一版不为以下未来功能提前建立复杂表结构：团队成员、组织、权限、评论、任务、提醒、附件二进制、供应商专属外部连接器、公开分享、能力评分、实时招聘市场匹配、简历模板、标签本体、向量索引、模型计费。当前岗位族推导只识别已确认经历中的重复工作信号，不读取招聘市场，也不等于职位匹配。`SourceAttribution` 与 `ImportBatch` 只描述用户已经确认导入的来源，不等于预建飞书/Codex 的全量同步模型；需要持续同步时必须另写决策记录并做 schema migration。
