import type {
  CaseSectionKey,
  CaseStudy,
  CaseStudyRevision,
  Citation,
  EpistemicKind,
  EvidenceItem,
  OutputBlock,
  Project,
} from "../../domain/model";

export const caseSectionLabels: Record<CaseSectionKey, string> = {
  background: "背景",
  problem: "问题",
  judgment: "判断",
  action: "行动",
  iteration: "迭代",
  result: "结果",
  capability: "形成的能力",
};

const epistemicLabels: Record<EpistemicKind, string> = {
  observed_fact: "已确认事实",
  user_judgment: "我的判断",
  ai_inference: "AI 推测",
  hypothesis: "待验证假设",
};

const evidenceTypeLabels: Record<EvidenceItem["type"], string> = {
  action: "行动",
  problem: "问题",
  decision: "决策",
  result: "结果",
  feedback: "反馈",
  learning: "学习",
  hypothesis: "假设",
};

export interface CaseStudyExportInput {
  caseStudy: CaseStudy;
  project: Project;
  revision: CaseStudyRevision;
  blocks: readonly OutputBlock[];
  evidenceItems: readonly EvidenceItem[];
  citations: readonly Citation[];
}

export function buildCaseStudyMarkdown(input: CaseStudyExportInput): string {
  const blocksBySection = new Map(
    input.blocks
      .filter((block) => block.reviewState !== "rejected")
      .sort((left, right) => left.order - right.order)
      .map((block) => [block.sectionKey as CaseSectionKey, block]),
  );
  const sections = (Object.keys(caseSectionLabels) as CaseSectionKey[]).flatMap(
    (sectionKey) => {
      const block = blocksBySection.get(sectionKey);
      const content = block ? formatBlockMarkdown(block) : "暂无内容";
      return [`## ${caseSectionLabels[sectionKey]}`, "", content, ""];
    },
  );
  const evidenceIndex = buildEvidenceIndex(input);

  return [
    `# 项目案例｜${input.caseStudy.title}`,
    "",
    `> 项目：${input.project.name}`,
    `> 时间范围：${input.caseStudy.rangeStart} — ${input.caseStudy.rangeEnd}`,
    `> 案例状态：${input.caseStudy.status === "finalized" ? "已定稿" : "草稿"}`,
    "",
    ...sections,
    "## 证据索引",
    "",
    evidenceIndex,
    "",
  ].join("\n");
}

export function buildCaseStudyPrintHtml(input: CaseStudyExportInput): string {
  const blocksBySection = new Map(
    input.blocks
      .filter((block) => block.reviewState !== "rejected")
      .sort((left, right) => left.order - right.order)
      .map((block) => [block.sectionKey as CaseSectionKey, block]),
  );
  const sections = (Object.keys(caseSectionLabels) as CaseSectionKey[])
    .map((sectionKey) => {
      const block = blocksBySection.get(sectionKey);
      return `<section><p class="kicker">${escapeHtml(caseSectionLabels[sectionKey])}</p><h2>${escapeHtml(caseSectionLabels[sectionKey])}</h2><div class="content">${block ? formatBlockHtml(block) : '<p class="empty">暂无内容</p>'}</div></section>`;
    })
    .join("\n");
  const evidence = input.evidenceItems
    .map((item, index) => {
      const citations = item.citationIds
        .map((id) => input.citations.find((citation) => citation.id === id))
        .filter((citation): citation is Citation => citation !== undefined);
      const source = citations.length
        ? citations
            .map(
              (citation) =>
                `<blockquote>${escapeHtml(citation.quoteSnapshot)}</blockquote>`,
            )
            .join("")
        : '<p class="empty">暂无原文引用</p>';
      return `<article class="evidence"><strong>${index + 1}. ${escapeHtml(evidenceTypeLabels[item.type])}</strong><p>${escapeHtml(item.statement)}</p>${source}</article>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(input.caseStudy.title)} · Trace / 迹</title>
  <style>
    :root { color: #292723; background: #f5f0e8; font-family: -apple-system, BlinkMacSystemFont, "Noto Sans CJK SC", "Microsoft YaHei", sans-serif; }
    body { max-width: 840px; margin: 0 auto; padding: 64px 48px; line-height: 1.8; }
    h1, h2 { font-family: Georgia, "Songti SC", STSong, serif; font-weight: 500; }
    h1 { margin: 0 0 12px; font-size: 42px; line-height: 1.25; }
    h2 { margin: 0 0 12px; font-size: 25px; }
    .meta, .kicker { color: #80665c; font-size: 12px; letter-spacing: .08em; }
    .meta { margin: 0 0 48px; }
    section { margin: 0 0 40px; padding-top: 24px; border-top: 1px solid #d9d0c5; break-inside: avoid; }
    section .kicker { margin: 0 0 2px; }
    .content p { margin: 0; white-space: pre-wrap; }
    .label { display: inline-block; margin-right: 8px; color: #80665c; font-size: 11px; }
    .empty { color: #958d83; }
    .evidence-index { margin-top: 56px; }
    .evidence { margin: 0 0 24px; padding: 16px 18px; border: 1px solid #d9d0c5; background: #fbf9f5; break-inside: avoid; }
    .evidence p { margin: 4px 0; }
    blockquote { margin: 10px 0 0; padding: 8px 12px; border-left: 2px solid #b15d4f; color: #655e57; font-size: 13px; white-space: pre-wrap; }
    .print-actions { position: sticky; top: 16px; display: flex; justify-content: flex-end; margin: -40px 0 24px; }
    button { border: 1px solid #b15d4f; padding: 8px 14px; background: #b15d4f; color: #fff; cursor: pointer; }
    @media (max-width: 620px) { body { padding: 32px 18px 48px; } h1 { font-size: 32px; } .print-actions { margin: -8px 0 24px; } }
    @media print { :root { background: #fff; } body { max-width: none; padding: 0; } .print-actions { display: none; } }
  </style>
</head>
<body>
  <div class="print-actions"><button type="button" onclick="window.print()">打印 / 保存 PDF</button></div>
  <main>
    <p class="meta">TRACE / 工作证据册 · 项目案例</p>
    <h1>${escapeHtml(input.caseStudy.title)}</h1>
    <p class="meta">项目：${escapeHtml(input.project.name)}<br />时间范围：${escapeHtml(input.caseStudy.rangeStart)} — ${escapeHtml(input.caseStudy.rangeEnd)}<br />状态：${input.caseStudy.status === "finalized" ? "已定稿" : "草稿"}</p>
    ${sections}
    <section class="evidence-index"><p class="kicker">证据索引</p><h2>这份案例引用了什么？</h2>${evidence || '<p class="empty">暂无纳入证据</p>'}</section>
  </main>
</body>
</html>`;
}

function formatBlockMarkdown(block: OutputBlock): string {
  const state = block.reviewState === "confirmed" ? "" : "（待确认）";
  return `**${epistemicLabels[block.epistemicKind]}${state}**\n\n${block.content}`;
}

function formatBlockHtml(block: OutputBlock): string {
  const state = block.reviewState === "confirmed" ? "" : "（待确认）";
  return `<p><span class="label">${escapeHtml(epistemicLabels[block.epistemicKind] + state)}</span>${escapeHtml(block.content)}</p>`;
}

function buildEvidenceIndex(input: CaseStudyExportInput): string {
  if (input.evidenceItems.length === 0) return "暂无纳入证据";
  return input.evidenceItems
    .map((item, index) => {
      const sources = item.citationIds
        .map((id) => input.citations.find((citation) => citation.id === id))
        .filter((citation): citation is Citation => citation !== undefined)
        .map((citation) => `> ${citation.quoteSnapshot}`)
        .join("\n");
      return [
        `${index + 1}. **${evidenceTypeLabels[item.type]}**：${item.statement}`,
        sources || "> 暂无原文引用",
      ].join("\n");
    })
    .join("\n\n");
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
