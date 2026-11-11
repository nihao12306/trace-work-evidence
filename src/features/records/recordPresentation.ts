import type {
  EpistemicKind,
  EvidenceType,
  ReviewState,
  Citation,
  EvidenceItem,
} from "../../domain/model";

export function countRecordEvidence(
  citations: Pick<Citation, "id" | "recordId">[],
  evidenceItems: Pick<EvidenceItem, "citationIds" | "reviewState">[],
): Map<string, number> {
  const recordByCitation = new Map(
    citations.map((item) => [item.id, item.recordId]),
  );
  const counts = new Map<string, number>();
  for (const evidence of evidenceItems) {
    if (evidence.reviewState === "rejected") continue;
    const recordIds = new Set(
      evidence.citationIds.map((id) => recordByCitation.get(id)),
    );
    for (const recordId of recordIds) {
      if (recordId !== undefined)
        counts.set(recordId, (counts.get(recordId) ?? 0) + 1);
    }
  }
  return counts;
}

export const evidenceTypeLabels: Record<EvidenceType, string> = {
  action: "行动",
  problem: "问题",
  decision: "决策",
  result: "结果",
  feedback: "反馈",
  learning: "学习",
  hypothesis: "假设",
};

export const epistemicLabels: Record<EpistemicKind, string> = {
  observed_fact: "已确认事实",
  user_judgment: "用户判断",
  ai_inference: "AI 推测",
  hypothesis: "待验证假设",
};

export const reviewLabels: Record<ReviewState, string> = {
  draft: "草稿",
  proposed: "待你确认",
  confirmed: "已确认",
  rejected: "已拒绝",
};

export function formatChineseDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${year} 年 ${Number(month)} 月 ${Number(day)} 日`;
}

export function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${Number(month)} 月 ${Number(day)} 日`;
}
