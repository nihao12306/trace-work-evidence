import type { CapabilityClaim, EvidenceItem, Project } from "./model";

export interface CareerDirectionCandidate {
  id: string;
  label: string;
  summary: string;
  strength: "strong" | "emerging";
  supportingEvidenceIds: string[];
  supportingClaimIds: string[];
  matchedSignals: string[];
}

export interface CareerDirectionInput {
  projects: readonly Project[];
  evidenceItems: readonly EvidenceItem[];
  capabilityClaims: readonly CapabilityClaim[];
}

interface DirectionRule {
  id: string;
  label: string;
  summary: string;
  signals: Array<{ label: string; pattern: RegExp }>;
}

const directionRules: DirectionRule[] = [
  {
    id: "content-strategy",
    label: "内容策略 / 内容运营",
    summary: "适合从受众动机出发设计内容结构，并用反馈或数据持续优化表达。",
    signals: [
      {
        label: "内容生产与策划",
        pattern: /内容|选题|叙事|脚本|编辑|文案|传播|观看|文章|视频|剪辑/u,
      },
      {
        label: "信息与结构设计",
        pattern: /结构|信息顺序|表达|故事|开头|呈现|组织材料/u,
      },
      {
        label: "内容效果验证",
        pattern: /观看率|阅读率|完播|传播|反馈|测试|受众/u,
      },
    ],
  },
  {
    id: "user-research",
    label: "用户研究 / 内容研究",
    summary: "适合通过访谈、观察和测试理解用户问题，再把洞察转成可行动的建议。",
    signals: [
      {
        label: "用户与研究材料",
        pattern: /用户|客户|受众|访谈|调研|观察|研究/u,
      },
      {
        label: "需求与动机洞察",
        pattern: /动机|需求|痛点|问题|反馈|理解|洞察/u,
      },
      {
        label: "验证与比较",
        pattern: /测试|样本|假设|比较|验证|基线/u,
      },
    ],
  },
  {
    id: "product",
    label: "产品经理 / 产品策划",
    summary:
      "适合围绕用户问题做取舍、设计方案，并通过迭代和结果反馈推进产品改进。",
    signals: [
      {
        label: "用户问题",
        pattern: /用户|需求|痛点|使用|体验|完成率/u,
      },
      {
        label: "方案与迭代",
        pattern: /方案|功能|流程|原型|迭代|上线|优化|改版/u,
      },
      {
        label: "优先级与取舍",
        pattern: /优先级|取舍|判断|决策|范围|验证/u,
      },
    ],
  },
  {
    id: "growth-operations",
    label: "增长运营 / 用户增长",
    summary: "适合围绕转化、留存或内容表现设计验证动作，并根据指标持续优化。",
    signals: [
      {
        label: "增长结果",
        pattern: /增长|转化|留存|获客|观看率|完成率|点击率|成交|收入/u,
      },
      {
        label: "实验与渠道",
        pattern: /投放|渠道|实验|测试|对照|基线|漏斗/u,
      },
      {
        label: "复盘与优化",
        pattern: /优化|提升|降低|复盘|迭代|验证/u,
      },
    ],
  },
  {
    id: "project-management",
    label: "项目管理 / 跨团队推进",
    summary: "适合协调多方目标与资源、处理风险，并把复杂事项推进到可交付结果。",
    signals: [
      {
        label: "跨团队协同",
        pattern: /跨团队|协同|协调|推进|沟通|对齐|干系人/u,
      },
      {
        label: "项目交付",
        pattern: /项目|排期|里程碑|交付|资源|风险/u,
      },
      {
        label: "问题处理",
        pattern: /阻塞|问题|取舍|决策|复盘|解决/u,
      },
    ],
  },
  {
    id: "data-analysis",
    label: "数据分析 / 业务分析",
    summary: "适合用指标、比较和验证拆解业务问题，为下一步判断提供依据。",
    signals: [
      {
        label: "指标与数据",
        pattern: /数据|指标|样本|基线|完成率|转化率|点击率|留存率/u,
      },
      {
        label: "分析与拆解",
        pattern: /分析|比较|归因|拆解|趋势|洞察/u,
      },
      {
        label: "实验与验证",
        pattern: /实验|测试|验证|假设|对照/u,
      },
    ],
  },
  {
    id: "operations",
    label: "产品运营 / 项目运营",
    summary: "适合建立流程、协同执行并根据一线反馈持续改善运营机制。",
    signals: [
      {
        label: "运营场景",
        pattern: /运营|活动|社区|服务|内容管理|用户维护/u,
      },
      {
        label: "流程与机制",
        pattern: /流程|机制|标准|SOP|协同|推进/u,
      },
      {
        label: "反馈与改善",
        pattern: /反馈|复盘|优化|迭代|改进/u,
      },
    ],
  },
];

export function inferCareerDirections(
  input: CareerDirectionInput,
): CareerDirectionCandidate[] {
  const projectById = new Map(
    input.projects.map((project) => [project.id, project]),
  );
  const evidence = input.evidenceItems.filter(
    (item) => item.reviewState === "confirmed" && item.type !== "hypothesis",
  );
  const claims = input.capabilityClaims.filter(
    (item) => item.reviewState === "confirmed",
  );

  return directionRules
    .map((rule, ruleIndex) => {
      const evidenceMatches = evidence.flatMap((item) => {
        const project = projectById.get(item.projectId ?? "");
        const text = [item.statement, project?.name, project?.description]
          .filter(Boolean)
          .join(" ");
        const signals = matchedSignals(rule, text);
        return signals.length > 0 ? [{ item, signals }] : [];
      });
      const claimMatches = claims.flatMap((claim) => {
        const signals = matchedSignals(
          rule,
          [claim.title, claim.statement, claim.context].join(" "),
        );
        return signals.length > 0 ? [{ claim, signals }] : [];
      });
      const signals = new Set(
        [...evidenceMatches, ...claimMatches].flatMap((match) => match.signals),
      );
      const sourceCount = evidenceMatches.length + claimMatches.length;
      const hasBehavior =
        claimMatches.length > 0 ||
        evidenceMatches.some(
          ({ item }) => item.type === "action" || item.type === "decision",
        );
      if (sourceCount < 2 || signals.size < 2 || !hasBehavior) {
        return undefined;
      }

      const hasOutcome = evidenceMatches.some(
        ({ item }) => item.type === "result" || item.type === "feedback",
      );
      const supportingProjectIds = new Set(
        evidenceMatches
          .map(({ item }) => item.projectId)
          .filter((id): id is string => id !== undefined),
      );
      const hasCrossProjectClaim = claimMatches.some(
        ({ claim }) => claim.scope === "cross_project",
      );
      const score =
        evidenceMatches.reduce(
          (total, { item, signals: itemSignals }) =>
            total + evidenceWeight(item.type) * Math.min(itemSignals.length, 2),
          0,
        ) +
        claimMatches.length * 4;

      return {
        candidate: {
          id: rule.id,
          label: rule.label,
          summary: rule.summary,
          strength:
            sourceCount >= 4 &&
            signals.size >= 3 &&
            hasOutcome &&
            (supportingProjectIds.size >= 2 || hasCrossProjectClaim)
              ? ("strong" as const)
              : ("emerging" as const),
          supportingEvidenceIds: evidenceMatches
            .sort(
              (left, right) =>
                evidenceWeight(right.item.type) -
                  evidenceWeight(left.item.type) ||
                right.item.occurredOn.localeCompare(left.item.occurredOn),
            )
            .map(({ item }) => item.id),
          supportingClaimIds: claimMatches.map(({ claim }) => claim.id),
          matchedSignals: [...signals],
        },
        score,
        ruleIndex,
      };
    })
    .filter(
      (
        item,
      ): item is {
        candidate: CareerDirectionCandidate;
        score: number;
        ruleIndex: number;
      } => item !== undefined,
    )
    .sort(
      (left, right) =>
        right.score - left.score || left.ruleIndex - right.ruleIndex,
    )
    .slice(0, 3)
    .map(({ candidate }) => candidate);
}

function matchedSignals(rule: DirectionRule, text: string): string[] {
  return rule.signals
    .filter((signal) => signal.pattern.test(text))
    .map((signal) => signal.label);
}

function evidenceWeight(type: EvidenceItem["type"]): number {
  switch (type) {
    case "decision":
    case "action":
    case "result":
      return 2;
    case "feedback":
    case "learning":
    case "problem":
      return 1;
    case "hypothesis":
      return 0;
  }
}
