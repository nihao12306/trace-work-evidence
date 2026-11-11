import { describe, expect, it } from "vitest";
import { describeStorageError } from "./storageErrors";

describe("storage error messages", () => {
  it.each([
    ["MissingAPIError", "IndexedDB 不可用", "本地存储不可用"],
    ["QuotaExceededError", "The quota has been exceeded", "空间不足"],
    ["TransactionInactiveError", "事务已中止", "事务失败"],
    ["VersionError", "database migration failed", "升级失败"],
  ])(
    "explains %s without exposing browser jargon",
    (name, message, expected) => {
      expect(describeStorageError({ name, message })).toContain(expected);
    },
  );

  it("follows a nested cause from a rejected database operation", () => {
    const error = new Error("保存失败", {
      cause: { name: "QuotaExceededError", message: "quota" },
    });

    expect(describeStorageError(error)).toContain("空间不足");
  });

  it("leaves unrelated domain errors to the original message", () => {
    expect(
      describeStorageError(new Error("项目名称不能为空。")),
    ).toBeUndefined();
  });
});
