import { describe, it, expect } from "vitest";
import {
  normalizePageSize,
  isValidImportType,
  sortJobsByDate,
  createPageStack,
} from "./import-history-utils";
import type { HistoryJobSummary } from "./imports-types";

function makeJob(overrides: Partial<HistoryJobSummary> = {}): HistoryJobSummary {
  return {
    jobId: "job-1",
    state: "complete",
    phase: "sync",
    startedAt: "2024-01-01T00:00:00Z",
    lastUpdatedAt: "2024-01-01T01:00:00Z",
    progress: { processed: 100, imported: 80, skipped: 10, failed: 10 },
    ...overrides,
  };
}

describe("normalizePageSize", () => {
  it("returns 20 for value 20", () => {
    expect(normalizePageSize(20)).toBe(20);
  });

  it("returns 50 for value 50", () => {
    expect(normalizePageSize(50)).toBe(50);
  });

  it("returns 100 for value 100", () => {
    expect(normalizePageSize(100)).toBe(100);
  });

  it("defaults to 20 for null", () => {
    expect(normalizePageSize(null)).toBe(20);
  });

  it("defaults to 20 for undefined", () => {
    expect(normalizePageSize(undefined)).toBe(20);
  });

  it("defaults to 20 for 0", () => {
    expect(normalizePageSize(0)).toBe(20);
  });

  it("defaults to 20 for invalid number 10", () => {
    expect(normalizePageSize(10)).toBe(20);
  });

  it("defaults to 20 for invalid number 25", () => {
    expect(normalizePageSize(25)).toBe(20);
  });

  it("defaults to 20 for string '20'", () => {
    expect(normalizePageSize("20")).toBe(20);
  });

  it("defaults to 20 for negative number", () => {
    expect(normalizePageSize(-50)).toBe(20);
  });

  it("defaults to 20 for floating point number", () => {
    expect(normalizePageSize(20.5)).toBe(20);
  });

  it("defaults to 20 for NaN", () => {
    expect(normalizePageSize(NaN)).toBe(20);
  });

  it("defaults to 20 for Infinity", () => {
    expect(normalizePageSize(Infinity)).toBe(20);
  });
});

describe("isValidImportType", () => {
  it("returns true for 'items'", () => {
    expect(isValidImportType("items")).toBe(true);
  });

  it("returns true for 'sales'", () => {
    expect(isValidImportType("sales")).toBe(true);
  });

  it("returns true for 'accounts'", () => {
    expect(isValidImportType("accounts")).toBe(true);
  });

  it("returns false for 'invalid'", () => {
    expect(isValidImportType("invalid")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isValidImportType("")).toBe(false);
  });

  it("returns false for capitalised 'Items'", () => {
    expect(isValidImportType("Items")).toBe(false);
  });

  it("returns false for uppercase 'ITEMS'", () => {
    expect(isValidImportType("ITEMS")).toBe(false);
  });

  it("returns false for singular 'item'", () => {
    expect(isValidImportType("item")).toBe(false);
  });

  it("returns false for type with trailing space", () => {
    expect(isValidImportType("items ")).toBe(false);
  });
});

describe("sortJobsByDate", () => {
  it("returns empty array for empty input", () => {
    expect(sortJobsByDate([])).toEqual([]);
  });

  it("returns single item unchanged", () => {
    const job = makeJob({ lastUpdatedAt: "2024-01-15T10:00:00Z" });
    const result = sortJobsByDate([job]);
    expect(result).toEqual([job]);
  });

  it("sorts jobs by lastUpdatedAt descending (most recent first)", () => {
    const older = makeJob({ jobId: "old", lastUpdatedAt: "2024-01-01T00:00:00Z" });
    const newer = makeJob({ jobId: "new", lastUpdatedAt: "2024-01-15T12:00:00Z" });
    const middle = makeJob({ jobId: "mid", lastUpdatedAt: "2024-01-10T06:00:00Z" });

    const result = sortJobsByDate([older, newer, middle]);
    expect(result.map((j) => j.jobId)).toEqual(["new", "mid", "old"]);
  });

  it("keeps already sorted array in same order", () => {
    const first = makeJob({ jobId: "a", lastUpdatedAt: "2024-03-01T00:00:00Z" });
    const second = makeJob({ jobId: "b", lastUpdatedAt: "2024-02-01T00:00:00Z" });
    const third = makeJob({ jobId: "c", lastUpdatedAt: "2024-01-01T00:00:00Z" });

    const result = sortJobsByDate([first, second, third]);
    expect(result.map((j) => j.jobId)).toEqual(["a", "b", "c"]);
  });

  it("handles reverse sorted input", () => {
    const first = makeJob({ jobId: "a", lastUpdatedAt: "2024-01-01T00:00:00Z" });
    const second = makeJob({ jobId: "b", lastUpdatedAt: "2024-02-01T00:00:00Z" });
    const third = makeJob({ jobId: "c", lastUpdatedAt: "2024-03-01T00:00:00Z" });

    const result = sortJobsByDate([first, second, third]);
    expect(result.map((j) => j.jobId)).toEqual(["c", "b", "a"]);
  });

  it("preserves relative order for same timestamps", () => {
    const jobA = makeJob({ jobId: "a", lastUpdatedAt: "2024-01-15T10:00:00Z" });
    const jobB = makeJob({ jobId: "b", lastUpdatedAt: "2024-01-15T10:00:00Z" });
    const jobC = makeJob({ jobId: "c", lastUpdatedAt: "2024-01-15T10:00:00Z" });

    const result = sortJobsByDate([jobA, jobB, jobC]);
    expect(result).toHaveLength(3);
    // All same timestamp — order is implementation-dependent but array should be stable
    expect(result.map((j) => j.jobId)).toEqual(["a", "b", "c"]);
  });

  it("does not mutate the input array", () => {
    const older = makeJob({ jobId: "old", lastUpdatedAt: "2024-01-01T00:00:00Z" });
    const newer = makeJob({ jobId: "new", lastUpdatedAt: "2024-01-15T12:00:00Z" });
    const input = [older, newer];

    sortJobsByDate(input);
    expect(input[0].jobId).toBe("old");
    expect(input[1].jobId).toBe("new");
  });
});

describe("createPageStack", () => {
  it("starts with size 0", () => {
    const stack = createPageStack();
    expect(stack.size()).toBe(0);
  });

  it("push increases size", () => {
    const stack = createPageStack();
    stack.push("cursor-1");
    expect(stack.size()).toBe(1);
    stack.push("cursor-2");
    expect(stack.size()).toBe(2);
  });

  it("pop returns items in LIFO order", () => {
    const stack = createPageStack();
    stack.push("first");
    stack.push("second");
    stack.push("third");

    expect(stack.pop()).toBe("third");
    expect(stack.pop()).toBe("second");
    expect(stack.pop()).toBe("first");
  });

  it("pop decreases size", () => {
    const stack = createPageStack();
    stack.push("a");
    stack.push("b");
    expect(stack.size()).toBe(2);

    stack.pop();
    expect(stack.size()).toBe(1);

    stack.pop();
    expect(stack.size()).toBe(0);
  });

  it("pop returns undefined on empty stack", () => {
    const stack = createPageStack();
    expect(stack.pop()).toBeUndefined();
  });

  it("pop returns undefined after all items removed", () => {
    const stack = createPageStack();
    stack.push("only");
    stack.pop();
    expect(stack.pop()).toBeUndefined();
  });

  it("peek returns the top item without removing it", () => {
    const stack = createPageStack();
    stack.push("first");
    stack.push("second");

    expect(stack.peek()).toBe("second");
    expect(stack.size()).toBe(2);
    expect(stack.peek()).toBe("second");
  });

  it("peek returns undefined on empty stack", () => {
    const stack = createPageStack();
    expect(stack.peek()).toBeUndefined();
  });

  it("clear empties the stack", () => {
    const stack = createPageStack();
    stack.push("a");
    stack.push("b");
    stack.push("c");

    stack.clear();
    expect(stack.size()).toBe(0);
    expect(stack.peek()).toBeUndefined();
    expect(stack.pop()).toBeUndefined();
  });

  it("stack is usable after clear", () => {
    const stack = createPageStack();
    stack.push("old");
    stack.clear();
    stack.push("new");

    expect(stack.size()).toBe(1);
    expect(stack.peek()).toBe("new");
    expect(stack.pop()).toBe("new");
  });
});
