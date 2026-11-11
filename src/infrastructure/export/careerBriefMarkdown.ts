import type {
  CapabilityClaim,
  CareerProfile,
  CaseSectionKey,
  CaseStudy,
  CaseStudyRevision,
  Citation,
  EvidenceItem,
  OutputBlock,
  Project,
} from "../../domain/model";
import {
  inferCareerDirections,
  type CareerDirectionCandidate,
} from "../../domain/careerDirections";

const evidenceTypeLabels: Record<EvidenceItem["type"], string> = {
  action: "行动",
  problem: "问题",
  decision: "决策",
  result: "结果",
  feedback: "反馈",
  learning: "学习",
  hypothesis: "假设",
};

const caseSectionLabels: Partial<Record<CaseSectionKey, string>> = {
  background: "背景",
  problem: "问题",
  judgment: "判断",
  action: "行动",
  iteration: "迭代",
  result: "结果",
  capability: "形成的能力",
};

export interface CareerBriefExportInput {
  profile?: CareerProfile;
  projects: readonly Project[];
  evidenceItems: readonly EvidenceItem[];
  citations: readonly Citation[];
  caseStudies: readonly CaseStudy[];
  caseStudyRevisions: readonly CaseStudyRevision[];
  outputBlocks: readonly OutputBlock[];
  capabilityClaims: readonly CapabilityClaim[];
}

export function buildCareerBriefMarkdown(
  input: CareerBriefExportInput,
): string {
  const confirmedEvidence = input.evidenceItems
    .filter((item) => item.reviewState === "confirmed")
    .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn));
  const outcomes = confirmedEvidence.filter(
    (item) => item.type === "result" || item.type === "feedback",
  );
  const decisionsAndActions = confirmedEvidence.filter(
    (item) => item.type === "decision" || item.type === "action",
  );
  const learningAndProblems = confirmedEvidence.filter(
    (item) => item.type === "learning" || item.type === "problem",
  );
  const finalizedCases = input.caseStudies.filter(
    (item) => item.status === "finalized",
  );
  const confirmedClaims = input.capabilityClaims.filter(
    (item) => item.reviewState === "confirmed",
  );
  const profile = input.profile;
  const directionCandidates = inferCareerDirections({
    projects: input.projects,
    evidenceItems: input.evidenceItems,
    capabilityClaims: input.capabilityClaims,
  });

  return [
    "# 岗位方向分析包｜从工作经历推导可能方向",
    "",
    "> 由 Trace 从已确认材料生成。岗位方向先从经历推导，用户偏好只用于后续筛选。",
    "> 系统方向属于待验证推断，不是竞争力评分或最终职业结论。",
    "> 分享前请检查公司名称、客户信息、未公开数据和其他敏感内容。",
    "",
    "## 用户提供的事实与筛选条件",
    "",
    field("当前岗位/职责", profile?.currentRole),
    field("对系统推导方向的反馈", profile?.targetDirections),
    field("希望继续做的工作", profile?.preferredWork),
    field("现实约束", profile?.constraints),
    field("明确排除项", profile?.dealBreakers),
    "",
    "## 已验证工作成果",
    "",
    evidenceList(outcomes, input),
    "",
    "## 关键判断与行动",
    "",
    evidenceList(decisionsAndActions, input),
    "",
    "## 问题与可复用学习",
    "",
    evidenceList(learningAndProblems, input),
    "",
    "## 已定稿代表项目",
    "",
    caseStudyList(finalizedCases, input),
    "",
    "## 已确认能力主张",
    "",
    capabilityList(confirmedClaims, input),
    "",
    "## 从经历推导的岗位方向（待验证）",
    "",
    directionList(directionCandidates, input),
    "",
    "## 当前证据缺口",
    "",
    ...gapLines({
      outcomes: outcomes.length,
      cases: finalizedCases.length,
      claims: confirmedClaims.length,
      inferredDirections: directionCandidates.length,
    }),
    "",
    "## 建议分析任务",
    "",
    "请基于以上材料完成：",
    "",
    "1. 用不夸大的语言总结 5—8 条可用于简历或面试的工作成果；",
    "2. 区分已被证据支持的能力、暂时推测的优势和仍需补证的部分；",
    "3. 先仅根据经历推导 2—3 个可能胜任的岗位方向，逐一引用证据并说明缺口；",
    "4. 再用用户偏好、现实约束与排除项筛选方向，不要用偏好反向改写经历；",
    "5. 给出每个方向的迁移风险、两周验证动作和最值得补齐的材料；",
    "6. 先提出必要追问，再形成最终建议，不要凭空补写行业、薪资或成绩。",
    "",
  ].join("\n");
}

function field(label: string, value?: string): string {
  return `- **${label}**：${value?.trim() || "待补充"}`;
}

function evidenceList(
  items: readonly EvidenceItem[],
  input: CareerBriefExportInput,
): string {
  if (items.length === 0) return "暂无已确认材料。";
  return items
    .map((item, index) => {
      const project = input.projects.find(
        (candidate) => candidate.id === item.projectId,
      );
      const quotes = item.citationIds
        .map((id) => input.citations.find((citation) => citation.id === id))
        .filter((citation): citation is Citation => citation !== undefined)
        .map((citation) => compact(citation.quoteSnapshot, 420));
      return [
        `${index + 1}. **${evidenceTypeLabels[item.type]}**｜${item.occurredOn}${project ? `｜${project.name}` : "｜未归项目"}`,
        `   - 结论：${item.statement}`,
        ...(quotes.length > 0
          ? quotes.map((quote) => `   - 原始依据：${quote}`)
          : ["   - 原始依据：当前引用缺失，请在使用前补齐。"]),
      ].join("\n");
    })
    .join("\n\n");
}

function caseStudyList(
  cases: readonly CaseStudy[],
  input: CareerBriefExportInput,
): string {
  if (cases.length === 0) return "暂无已定稿项目案例。";
  return cases
    .map((caseStudy, index) => {
      const project = input.projects.find(
        (candidate) => candidate.id === caseStudy.projectId,
      );
      const revision = input.caseStudyRevisions.find(
        (candidate) => candidate.id === caseStudy.currentRevisionId,
      );
      const blocks = revision
        ? input.outputBlocks
            .filter(
              (block) =>
                block.ownerId === revision.id &&
                block.reviewState === "confirmed",
            )
            .sort((left, right) => left.order - right.order)
        : [];
      return [
        `${index + 1}. **${caseStudy.title}**｜${project?.name ?? "未知项目"}｜${caseStudy.rangeStart}—${caseStudy.rangeEnd}`,
        ...blocks.map(
          (block) =>
            `   - ${caseSectionLabels[block.sectionKey as CaseSectionKey] ?? block.sectionKey}：${block.content}`,
        ),
      ].join("\n");
    })
    .join("\n\n");
}

function capabilityList(
  claims: readonly CapabilityClaim[],
  input: CareerBriefExportInput,
): string {
  if (claims.length === 0) return "暂无已确认能力主张。";
  return claims
    .map((claim, index) => {
      const projects = input.caseStudies
        .filter((caseStudy) => claim.caseStudyIds.includes(caseStudy.id))
        .map((caseStudy) =>
          input.projects.find((project) => project.id === caseStudy.projectId),
        )
        .filter((project): project is Project => project !== undefined)
        .map((project) => project.name);
      return [
        `${index + 1}. **${claim.title}**｜${projects.join("、") || "单项目范围"}`,
        `   - 主张：${claim.statement}`,
        `   - 情境：${claim.context}`,
        `   - 边界：${claim.limitations?.trim() || "目前只由已关联项目支持。"}`,
      ].join("\n");
    })
    .join("\n\n");
}

function directionList(
  directions: readonly CareerDirectionCandidate[],
  input: CareerBriefExportInput,
): string {
  if (directions.length === 0) {
    return "现有已确认材料不足以支持岗位方向推导。";
  }
  return directions
    .map((direction, index) => {
      const evidence = direction.supportingEvidenceIds
        .map((id) => input.evidenceItems.find((item) => item.id === id))
        .filter((item): item is EvidenceItem => item !== undefined)
        .slice(0, 4);
      return [
        `${index + 1}. **${direction.label}**｜${direction.strength === "strong" ? "较强线索" : "初步线索"}`,
        `   - 推导理由：${direction.summary}`,
        `   - 反复出现的工作信号：${direction.matchedSignals.join("、")}`,
        ...evidence.map((item) => `   - 支持经历：${item.statement}`),
        "   - 边界：该方向仍需结合岗位要求、个人偏好和市场信息验证。",
      ].join("\n");
    })
    .join("\n\n");
}

function gapLines(input: {
  outcomes: number;
  cases: number;
  claims: number;
  inferredDirections: number;
}): string[] {
  const gaps = [
    input.outcomes === 0
      ? "- 缺少已确认的结果或反馈；先补充可观察变化、数据或他人反馈。"
      : undefined,
    input.cases === 0
      ? "- 还没有已定稿项目案例；建议至少整理一个判断—行动—结果完整的代表项目。"
      : undefined,
    input.claims === 0
      ? "- 还没有已确认能力主张；先从已定稿案例中沉淀一条克制的单项目主张。"
      : undefined,
    input.inferredDirections === 0
      ? "- 已确认经历的重复信号还不足以推导岗位方向；先补充至少两条相互支持的判断、行动、结果或反馈。"
      : undefined,
  ].filter((item): item is string => item !== undefined);
  return gaps.length > 0 ? gaps : ["- 核心材料已具备，可以开始比较候选方向。"];
}

function compact(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}
