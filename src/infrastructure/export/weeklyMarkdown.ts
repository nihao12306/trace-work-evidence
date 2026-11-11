import type {
  Citation,
  OutputBlock,
  WeeklySectionKey,
} from "../../domain/model";

const epistemicLabels = {
  observed_fact: "已确认事实",
  user_judgment: "我的判断",
  ai_inference: "AI 推测",
  hypothesis: "待验证假设",
} as const;

export const weeklySectionLabels: Record<WeeklySectionKey, string> = {
  focus: "本周重点工作",
  results: "已产生的结果",
  went_well: "做得好的地方",
  problems: "存在的问题",
  supported_causes: "有证据支持的原因",
  inferred_causes: "暂时推测的原因",
  next_validations: "下周准备验证的事情",
  personal_reflection: "我的工作思考",
};

export function buildWeeklyMarkdown(input: {
  weekStart: string;
  weekEnd: string;
  blocks: readonly OutputBlock[];
  citations: readonly Citation[];
}): string {
  const sections = (Object.keys(weeklySectionLabels) as WeeklySectionKey[]).map(
    (sectionKey) => {
      const blocks = input.blocks
        .filter(
          (block) =>
            block.sectionKey === sectionKey && block.reviewState !== "rejected",
        )
        .sort((left, right) => left.order - right.order);
      const content = blocks.length
        ? blocks
            .map((block) => {
              const state =
                block.reviewState === "confirmed" ? "" : "（待确认）";
              return `- **${epistemicLabels[block.epistemicKind]}${state}** ${block.content}`;
            })
            .join("\n")
        : "- 暂无记录";
      return `## ${weeklySectionLabels[sectionKey]}\n\n${content}`;
    },
  );

  const sourceIds = new Set(input.blocks.flatMap((block) => block.citationIds));
  const sources = input.citations.filter((citation) =>
    sourceIds.has(citation.id),
  );
  const sourceIndex = sources.length
    ? sources
        .map((citation, index) => `${index + 1}. ${citation.quoteSnapshot}`)
        .join("\n")
    : "暂无来源";

  return [
    `# 工作周报｜${input.weekStart} — ${input.weekEnd}`,
    "",
    ...sections,
    "## 证据索引",
    "",
    sourceIndex,
    "",
  ].join("\n");
}
