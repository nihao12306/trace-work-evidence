import { describe, expect, it } from "vitest";
import { countRecordEvidence } from "./recordPresentation";

describe("记录证据计数", () => {
  it("同一证据的多个原文引用不重复计数，拒绝项和缺失引用不计入", () => {
    const counts = countRecordEvidence(
      [
        { id: "a", recordId: "one" },
        { id: "b", recordId: "one" },
        { id: "c", recordId: "two" },
      ],
      [
        { citationIds: ["a", "b", "c", "missing"], reviewState: "proposed" },
        { citationIds: ["a"], reviewState: "confirmed" },
        { citationIds: ["c"], reviewState: "rejected" },
        { citationIds: ["missing"], reviewState: "draft" },
      ],
    );
    expect([...counts]).toEqual([
      ["one", 2],
      ["two", 1],
    ]);
  });
});
