/**
 * Unit tests for the display helpers in format.ts (pure functions, no browser or server needed).
 * Run: npm test
 *
 * TDD cycle 2 (frontend): the two "money rounding" cases below were written BEFORE the fix.
 * Bug: a budget just under $1,000 (e.g. 999.6) showed as "$1000" instead of "$1k", and
 * 1000.4 showed as "$1.0k". RED -> fixed money() -> GREEN -> refactor (see TESTING.md).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatBudget, platformLabel, scoreTone, sourceName, timeAgo } from "./format";

describe("formatBudget", () => {
  it("shows a range for hourly jobs", () => {
    expect(formatBudget({ budget_min: 25, budget_max: 40, budget_type: "hourly" })).toBe("$25–$40/hr");
  });

  it("shows one value when min and max are equal or one is missing", () => {
    expect(formatBudget({ budget_min: 500, budget_max: 500, budget_type: "fixed" })).toBe("$500 fixed");
    expect(formatBudget({ budget_min: null, budget_max: 300, budget_type: "fixed" })).toBe("$300 fixed");
    expect(formatBudget({ budget_min: 30, budget_max: null, budget_type: "hourly" })).toBe("$30/hr");
  });

  it("uses k for thousands", () => {
    expect(formatBudget({ budget_min: 1000, budget_max: 2500, budget_type: "fixed" })).toBe("$1k–$2.5k fixed");
  });

  it("says when the budget is unknown", () => {
    expect(formatBudget({ budget_min: null, budget_max: null, budget_type: "fixed" })).toBe("Budget not stated");
  });

  // --- TDD cycle 2: written first, failed before the fix ---
  it("rounds a budget just under 1,000 to $1k, not $1000", () => {
    expect(formatBudget({ budget_min: null, budget_max: 999.6, budget_type: "fixed" })).toBe("$1k fixed");
  });

  it("does not show a useless .0 in thousands", () => {
    expect(formatBudget({ budget_min: null, budget_max: 1000.4, budget_type: "fixed" })).toBe("$1k fixed");
    expect(formatBudget({ budget_min: null, budget_max: 2049, budget_type: "fixed" })).toBe("$2k fixed");
  });
});

describe("timeAgo", () => {
  const NOW = new Date("2026-11-19T12:00:00Z");
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); });
  afterEach(() => { vi.useRealTimers(); });

  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  it("covers minutes, hours and days", () => {
    expect(timeAgo(ago(20_000))).toBe("just now");
    expect(timeAgo(ago(5 * 60_000))).toBe("5m ago");
    expect(timeAgo(ago(3 * 3_600_000))).toBe("3h ago");
    expect(timeAgo(ago(3 * 86_400_000))).toBe("3d ago");
  });

  it("treats a date in the future as just now", () => {
    expect(timeAgo(new Date(NOW.getTime() + 60_000).toISOString())).toBe("just now");
  });
});

describe("platformLabel / sourceName", () => {
  it("names every job source", () => {
    expect(platformLabel("freelancer", null)).toBe("Freelancer.com");
    expect(platformLabel("himalayas", null)).toBe("Himalayas");
    expect(platformLabel("manual", null)).toBe("Added by you");
    expect(platformLabel("csv", "https://www.freelancer.com/projects/x")).toBe("Freelancer.com · seed");
    expect(platformLabel("csv", null)).toBe("Seed dataset");
    expect(sourceName(null)).toBe("—");
    expect(sourceName("synthetic")).toBe("Synthetic");
  });
});

describe("scoreTone", () => {
  it("uses the documented colour bands (75+ strong, 50-74 possible, under 50 weak)", () => {
    expect(scoreTone(75).label).toBe("Strong fit");
    expect(scoreTone(74).label).toBe("Possible fit");
    expect(scoreTone(50).label).toBe("Possible fit");
    expect(scoreTone(49).label).toBe("Weak fit");
  });
});
