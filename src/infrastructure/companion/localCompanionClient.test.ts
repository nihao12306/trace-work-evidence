import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CompanionProtocolError,
  CompanionUnavailableError,
  HttpLocalCompanionClient,
} from "./localCompanionClient";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("HttpLocalCompanionClient", () => {
  it("accepts a compatible health response without reading user data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            protocol: "trace-local-companion",
            protocolVersion: 1,
            companionVersion: "0.1.0",
            status: "ready",
            capabilities: ["health"],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );

    const health = await new HttpLocalCompanionClient().checkHealth();
    expect(health.protocolVersion).toBe(1);
    expect(health.capabilities).toEqual(["health"]);
  });

  it("rejects an incompatible response before any import can happen", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ protocol: "other" }), { status: 200 }),
        ),
    );

    await expect(new HttpLocalCompanionClient().checkHealth()).rejects.toThrow(
      CompanionProtocolError,
    );
  });

  it("turns a network failure into an understandable offline state", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    await expect(new HttpLocalCompanionClient().checkHealth()).rejects.toThrow(
      CompanionUnavailableError,
    );
  });

  it("validates preview and confirmation responses before the app can write", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              protocol: "trace-local-companion",
              protocolVersion: 1,
              previewId: "preview-1",
              provider: "codex",
              scopeSummary: "选中的一个任务",
              selectedCount: 1,
              items: [
                {
                  externalId: "task-1",
                  occurredOn: "2026-08-13",
                  title: "任务一",
                  text: "完成了一个小改动。",
                },
              ],
              expiresAt: "2026-08-13T02:00:00.000Z",
            }),
            { status: 200 },
          ),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              protocol: "trace-local-companion",
              protocolVersion: 1,
              previewId: "preview-1",
              status: "confirmed",
              selectedCount: 1,
            }),
            { status: 200 },
          ),
        ),
    );

    const client = new HttpLocalCompanionClient();
    await expect(
      client.requestPreview({ provider: "codex", scope: "task-1" }),
    ).resolves.toMatchObject({ previewId: "preview-1", selectedCount: 1 });
    await expect(
      client.confirmImport({
        previewId: "preview-1",
        selectedExternalIds: ["task-1"],
      }),
    ).resolves.toMatchObject({ status: "confirmed" });
  });
});
