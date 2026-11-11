import { afterEach, describe, expect, it, vi } from "vitest";
import { CustomEndpointAiAdapter } from "./customEndpointAiAdapter";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CustomEndpointAiAdapter", () => {
  it("只发送 Trace 约定的结构化输入，并返回候选", async () => {
    const fetchMock = vi.fn(
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            proposals: [
              {
                statement: "把一次发布前检查整理成了可复用步骤",
                type: "learning",
                epistemicKind: "user_judgment",
                occurredOn: "2026-08-17",
                sourceCitationIds: ["citation-1"],
              },
            ],
          }),
        }) as Response,
    );
    vi.stubGlobal("fetch", fetchMock);

    const adapter = new CustomEndpointAiAdapter("http://127.0.0.1:8787/trace");
    const result = await adapter.extractEvidence({
      recordId: "record-1",
      revisionId: "revision-1",
      originalText: "今天完成了发布前检查。",
      occurredOn: "2026-08-17",
      sourceCandidates: [
        {
          citationId: "citation-1",
          quoteSnapshot: "今天完成了发布前检查。",
          statement: "把一次发布前检查整理成了可复用步骤",
          type: "learning",
          epistemicKind: "user_judgment",
          occurredOn: "2026-08-17",
        },
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.sourceCitationIds).toEqual(["citation-1"]);
    const [, options] = fetchMock.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(options.credentials).toBe("omit");
    expect(options.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(options.body))).toEqual({
      protocol: "trace-custom-ai",
      protocolVersion: 1,
      task: "extract_evidence",
      input: expect.objectContaining({
        recordId: "record-1",
        revisionId: "revision-1",
        originalText: "今天完成了发布前检查。",
      }),
    });
  });

  it("拒绝无效响应和 HTTP 错误，不产生隐式候选", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({
            ok: true,
            status: 200,
            json: async () => ({ proposals: [{ content: "没有栏目" }] }),
          }) as Response,
      ),
    );
    const adapter = new CustomEndpointAiAdapter("https://example.test/trace");
    await expect(
      adapter.draftWeeklyReview({ weeklyReviewId: "week-1", evidence: [] }),
    ).rejects.toThrow("响应格式无效");

    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          ({ ok: false, status: 503, json: async () => ({}) }) as Response,
      ),
    );
    await expect(
      adapter.draftWeeklyReview({ weeklyReviewId: "week-1", evidence: [] }),
    ).rejects.toThrow("HTTP 503");
  });
});
