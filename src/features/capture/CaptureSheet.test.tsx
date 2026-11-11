import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CaptureSheet } from "./CaptureSheet";

const createRecord = vi.fn();
const clearError = vi.fn();

vi.mock("../../app/WorkspaceContext", () => ({
  useWorkspace: () => ({
    snapshot: { projects: [] },
    createRecord,
    clearError,
  }),
}));

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

describe("CaptureSheet storage failure", () => {
  beforeEach(() => {
    createRecord.mockReset();
    clearError.mockReset();
    createRecord.mockRejectedValue(
      new Error("本地存储事务失败：这次写入已回滚。"),
    );
  });

  it("keeps uncommitted original text after a failed save", async () => {
    render(<CaptureSheet onClose={vi.fn()} />);
    const text = "这段尚未提交的工作记录不能因为存储失败而消失。";
    const editor = screen.getByRole("textbox", { name: /原始文字/ });
    fireEvent.change(editor, { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "保存记录" }));

    expect(await screen.findByRole("alert", { name: "" })).toHaveTextContent(
      /未保存/,
    );
    await waitFor(() => expect(editor).toHaveValue(text));
    expect(createRecord).toHaveBeenCalledTimes(1);
  });
});
