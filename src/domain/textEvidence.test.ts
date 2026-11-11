import { describe, expect, it } from "vitest";
import { extractTextEvidenceProposals } from "./textEvidence";

describe("extractTextEvidenceProposals", () => {
  it("extracts conservative candidates from a raw Chinese work note", () => {
    const text =
      "今天一直在修改这个切片自动化工作台，遇到了很多问题。但是突然想通的是，假如一直跟 AI 聊不通，不妨先让他告诉我他分的原则是什么，我们从底层的规则开始聊。这样比一个一个修改上面不断冒出来的问题更好用一些。";

    const proposals = extractTextEvidenceProposals(text);

    expect(proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "action",
          epistemicKind: "observed_fact",
          statement: "正在修改这个切片自动化工作台",
          quoteSnapshot: "今天一直在修改这个切片自动化工作台",
        }),
        expect.objectContaining({
          type: "problem",
          statement: "工作过程中遇到了很多问题",
          quoteSnapshot: "遇到了很多问题",
        }),
        expect.objectContaining({
          type: "decision",
          statement: "先让 AI 说明分类原则，并从底层规则开始讨论",
          quoteSnapshot:
            "不妨先让他告诉我他分的原则是什么，我们从底层的规则开始聊",
        }),
        expect.objectContaining({
          type: "learning",
          epistemicKind: "user_judgment",
          statement: "判断这种做法比一个一个修改不断冒出的问题更好用",
          quoteSnapshot: "这样比一个一个修改上面不断冒出来的问题更好用一些",
        }),
      ]),
    );
    expect(proposals.some((item) => item.type === "result")).toBe(false);
    expect(
      proposals.some(
        (item) => item.type === "problem" && item.statement.includes("更好用"),
      ),
    ).toBe(false);
    expect(proposals.every((item) => text.includes(item.quoteSnapshot))).toBe(
      true,
    );
    expect(
      proposals.some((item) => item.statement === item.quoteSnapshot),
    ).toBe(false);
  });

  it("does not invent a result when the note only describes a plan", () => {
    const proposals = extractTextEvidenceProposals(
      "准备下周测试新的入口，可能会减少首次使用时的困惑。",
    );

    expect(proposals.some((item) => item.type === "result")).toBe(false);
    expect(proposals).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "action" }),
        expect.objectContaining({ type: "hypothesis" }),
      ]),
    );
  });
});
