import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { traceDatabase } from "./infrastructure/db/traceDatabase";
import { workbenchService } from "./app/services";

describe("App", () => {
  beforeEach(async () => {
    await traceDatabase.delete();
    await traceDatabase.open();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await traceDatabase.delete();
  });

  it("introduces the evidence principle before creating a workspace", async () => {
    render(<App />);

    expect(
      await screen.findByRole(
        "heading",
        {
          name: "让工作的来路，留在结论旁边。",
        },
        { timeout: 5000 },
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "从空白开始" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "载入演示工作册" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/数据默认只保存在这台设备的浏览器中/),
    ).toBeInTheDocument();
    expect(screen.queryByText("一键生成专业周报")).not.toBeInTheDocument();
  });

  it("keeps a visible loading state while the local workbook is opening", () => {
    vi.spyOn(workbenchService, "getSnapshot").mockReturnValue(
      new Promise(() => undefined),
    );

    render(<App />);

    expect(
      screen.getByText("读取保存在这台设备上的工作证据…"),
    ).toBeInTheDocument();
  });

  it("explains a storage error and offers a retry action", async () => {
    vi.spyOn(workbenchService, "getSnapshot").mockRejectedValue(
      new DOMException("quota", "QuotaExceededError"),
    );

    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "本地档案暂时无法读取",
    );
    expect(
      screen.getByRole("button", { name: "再试一次" }),
    ).toBeInTheDocument();
  });
});
