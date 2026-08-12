import { describe, expect, it } from "vitest";
import { addDays, currentDateInTimeZone } from "../src/dates.js";

describe("date calculation", () => {
  it("uses the configured local date", () => {
    const instant = new Date("2026-08-11T21:30:00Z");
    expect(currentDateInTimeZone(instant, "Asia/Jerusalem")).toBe("2026-08-12");
    expect(currentDateInTimeZone(instant, "UTC")).toBe("2026-08-11");
  });

  it("adds calendar days across month boundaries", () => {
    expect(addDays("2026-08-31", 1)).toBe("2026-09-01");
  });
});

