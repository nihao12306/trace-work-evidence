import type { EpistemicKind, EvidenceType } from "./model";

export interface TextEvidenceProposal {
  type: EvidenceType;
  epistemicKind: EpistemicKind;
  statement: string;
  quoteSnapshot: string;
  charRange: { start: number; end: number };
}

interface Clause {
  text: string;
  start: number;
  end: number;
}

const ruleOrder: Array<{
  type: EvidenceType;
  epistemicKind: EpistemicKind;
  test: (clause: string) => boolean;
  limit: number;
}> = [
  {
    type: "action",
    epistemicKind: "observed_fact",
    test: (clause) =>
      /(修改|整理|测试|搭建|复查|调研|尝试|处理|沟通|完成|做了|开始|持续|一直在|正在)/u.test(
        clause,
      ),
    limit: 1,
  },
  {
    type: "problem",
    epistemicKind: "observed_fact",
    test: (clause) =>
      !/^(假如|如果)/u.test(clause) &&
      !/(更好用|更适合|想通|发现|意识到|学到|说明|意味着)/u.test(clause) &&
      /(遇到|遇到了|问题|困难|卡住|卡在|聊不通|无法|失败|缺少|没有)/u.test(
        clause,
      ),
    limit: 2,
  },
  {
    type: "decision",
    epistemicKind: "user_judgment",
    test: (clause) =>
      /(不妨|决定|选择|先让|改为|采用|从.+开始|应该|转向|不再)/u.test(clause),
    limit: 2,
  },
  {
    type: "result",
    epistemicKind: "observed_fact",
    test: (clause) =>
      !/(可能|也许|或许|假如|如果|预计|大概率)/u.test(clause) &&
      /(结果|完成率|提升|下降|上线|交付|解决|验证|得到|产出|增长|减少)/u.test(
        clause,
      ),
    limit: 2,
  },
  {
    type: "feedback",
    epistemicKind: "observed_fact",
    test: (clause) => /(反馈|评价|有人说|用户说|同事说|客户说)/u.test(clause),
    limit: 2,
  },
  {
    type: "learning",
    epistemicKind: "user_judgment",
    test: (clause) =>
      !/想通的是$/u.test(clause) &&
      /(想通的是|发现|意识到|学到|说明|更好用|更适合|意味着)/u.test(clause),
    limit: 1,
  },
  {
    type: "hypothesis",
    epistemicKind: "hypothesis",
    test: (clause) => /(可能|也许|或许|预计|大概率)/u.test(clause),
    limit: 1,
  },
];

/**
 * 在没有模型的情况下，从原始文字中提出保守的结构候选。
 * statement 是可复用的证据表达，quoteSnapshot 才是原文依据；二者不能混为一谈。
 * 这里只做低风险的压缩和合并，不补写结果，也不把条件句强行变成事实。
 */
export function extractTextEvidenceProposals(
  text: string,
): TextEvidenceProposal[] {
  const clauses = collectClauses(text);
  const proposals: TextEvidenceProposal[] = [];
  const seen = new Set<string>();

  for (const rule of ruleOrder) {
    if (rule.type === "decision") {
      const grouped = buildGroupedDecision(text, clauses);
      if (grouped) {
        proposals.push(grouped);
        seen.add(`${grouped.type}:${grouped.quoteSnapshot}`);
        continue;
      }
    }
    let count = 0;
    for (const clause of clauses) {
      const quoteSnapshot = normalizeClause(clause.text);
      if (
        !quoteSnapshot ||
        quoteSnapshot.length < 2 ||
        !rule.test(quoteSnapshot)
      )
        continue;

      const key = `${rule.type}:${quoteSnapshot}`;
      if (seen.has(key)) continue;
      seen.add(key);
      proposals.push({
        type: rule.type,
        epistemicKind: rule.epistemicKind,
        statement: summarizeStatement(rule.type, quoteSnapshot),
        quoteSnapshot,
        charRange: { start: clause.start, end: clause.end },
      });
      count += 1;
      if (count >= rule.limit) break;
    }
  }

  return proposals;
}

function buildGroupedDecision(
  text: string,
  clauses: Clause[],
): TextEvidenceProposal | undefined {
  const principle = clauses.find((clause) =>
    /不妨先让他告诉我他分的原则是什么/u.test(normalizeClause(clause.text)),
  );
  const bottomRule = clauses.find((clause) =>
    /从底层的规则开始聊/u.test(normalizeClause(clause.text)),
  );
  if (!principle || !bottomRule) return undefined;

  const start = principle.start;
  const end = bottomRule.end;
  return {
    type: "decision",
    epistemicKind: "user_judgment",
    statement: "先让 AI 说明分类原则，并从底层规则开始讨论",
    quoteSnapshot: normalizeClause(text.slice(start, end)),
    charRange: { start, end },
  };
}

function summarizeStatement(type: EvidenceType, quote: string): string {
  switch (type) {
    case "action":
      return quote
        .replace(/^今天一直在/u, "正在")
        .replace(/^一直在/u, "正在")
        .replace(/^正在/u, "正在");
    case "problem":
      return quote === "遇到了很多问题" ? "工作过程中遇到了很多问题" : quote;
    case "decision":
      if (quote === "不妨先让他告诉我他分的原则是什么") {
        return "先让 AI 说明分类原则";
      }
      if (quote === "我们从底层的规则开始聊") {
        return "从底层规则开始讨论";
      }
      return quote;
    case "learning":
      return quote
        .replace(/^这样比/u, "判断这种做法比")
        .replace(/上面不断冒出来的问题/u, "不断冒出的问题")
        .replace(/一些$/u, "");
    default:
      return quote;
  }
}

function collectClauses(text: string): Clause[] {
  const clauses: Clause[] = [];
  const pattern = /[^，。！？；\n]+/gu;
  for (const match of text.matchAll(pattern)) {
    const raw = match[0];
    const start = match.index ?? 0;
    clauses.push({ text: raw, start, end: start + raw.length });
  }
  return clauses;
}

function normalizeClause(value: string): string {
  return value.replace(/^[，。！？；\s]+|[，。！？；\s]+$/gu, "").trim();
}
