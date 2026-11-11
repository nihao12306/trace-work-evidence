import { describe, expect, it } from "vitest";
import { DEFAULT_TIMEZONE, isValidTimeZone, todayInTimeZone } from "./date";

describe("workspace dates", () => {
  it("uses the workspace timezone instead of UTC around midnight", () => {
    const now = new Date("2026-09-06T16:30:00.000Z");

    expect(todayInTimeZone("Asia/Shanghai", now)).toBe("2026-09-07");
    expect(todayInTimeZone("America/Los_Angeles", now)).toBe("2026-09-06");
  });

  it("falls back safely when an imported timezone is invalid", () => {
    const now = new Date("2026-09-06T16:30:00.000Z");

    expect(isValidTimeZone("not-a-timezone")).toBe(false);
    expect(todayInTimeZone("not-a-timezone", now)).toBe(
      todayInTimeZone(DEFAULT_TIMEZONE, now),
    );
  });
});
