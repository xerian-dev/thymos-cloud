import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runGenericFetchLoop } from "../generic-fetch-orchestrator";
import type { GenericFetchOrchestratorConfig } from "../generic-fetch-orchestrator";
import type { ImportJob } from "../generic-job-manager";

interface TestRecord {
  id: string;
  name: string;
}

function createMockConfig(
  overrides: Partial<GenericFetchOrchestratorConfig<TestRecord>> = {},
): GenericFetchOrchestratorConfig<TestRecord> {
  const mockGetJob = vi.fn<(jobId: string) => Promise<ImportJob | null>>();
  const mockTransitionJob = vi.fn<() => Promise<void>>();
  const mockSaveCheckpoint = vi.fn<() => Promise<void>>();
  const mockLoadCheckpoint = vi.fn<() => Promise<null>>();
  const mockFetchPage =
    vi.fn<() => Promise<{ data: TestRecord[]; nextCursor: string | null }>>();
  const mockStageRecords =
    vi.fn<() => Promise<{ staged: number; skipped: number }>>();

  mockGetJob.mockResolvedValue({
    jobId: "test-job-id",
    state: "running",
    phase: "fetch",
    startedAt: "2025-01-15T10:00:00.000Z",
    lastUpdatedAt: "2025-01-15T10:00:00.000Z",
    filterParams: {},
    progress: { processed: 0, imported: 0, skipped: 0, failed: 0 },
  });

  mockLoadCheckpoint.mockResolvedValue(null);
  mockSaveCheckpoint.mockResolvedValue(undefined);
  mockTransitionJob.mockResolvedValue(undefined);
  mockStageRecords.mockResolvedValue({ staged: 5, skipped: 0 });

  return {
    jobId: "test-job-id",
    startTime: Date.now(),
    timeoutThresholdMs: 60_000,
    pageLimit: 100,
    fetchPage: mockFetchPage,
    stageRecords: mockStageRecords,
    jobManager: { getJob: mockGetJob, transitionJob: mockTransitionJob },
    checkpointManager: {
      saveCheckpoint: mockSaveCheckpoint,
      loadCheckpoint: mockLoadCheckpoint,
    },
    ...overrides,
  };
}

describe("generic-fetch-orchestrator", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("pagination loop processes all pages", () => {
    it("fetches all pages until cursor is null and returns 'complete'", async () => {
      const config = createMockConfig();
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;

      fetchPage
        .mockResolvedValueOnce({
          data: [{ id: "1", name: "A" }],
          nextCursor: "cursor-2",
        })
        .mockResolvedValueOnce({
          data: [{ id: "2", name: "B" }],
          nextCursor: "cursor-3",
        })
        .mockResolvedValueOnce({
          data: [{ id: "3", name: "C" }],
          nextCursor: null,
        });

      const result = await runGenericFetchLoop(config);

      expect(result).toEqual({ status: "complete", jobId: "test-job-id" });
      expect(fetchPage).toHaveBeenCalledTimes(3);
      expect(fetchPage).toHaveBeenNthCalledWith(1, null, 100);
      expect(fetchPage).toHaveBeenNthCalledWith(2, "cursor-2", 100);
      expect(fetchPage).toHaveBeenNthCalledWith(3, "cursor-3", 100);
    });
  });

  describe("calls stageRecords for each page", () => {
    it("invokes stageRecords with each page's data", async () => {
      const config = createMockConfig();
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;
      const stageRecords = config.stageRecords as ReturnType<typeof vi.fn>;

      fetchPage
        .mockResolvedValueOnce({
          data: [{ id: "1", name: "A" }],
          nextCursor: "cursor-2",
        })
        .mockResolvedValueOnce({
          data: [
            { id: "2", name: "B" },
            { id: "3", name: "C" },
          ],
          nextCursor: null,
        });

      stageRecords.mockResolvedValue({ staged: 1, skipped: 0 });

      await runGenericFetchLoop(config);

      expect(stageRecords).toHaveBeenCalledTimes(2);
      expect(stageRecords).toHaveBeenNthCalledWith(1, [{ id: "1", name: "A" }]);
      expect(stageRecords).toHaveBeenNthCalledWith(2, [
        { id: "2", name: "B" },
        { id: "3", name: "C" },
      ]);
    });
  });

  describe("saves checkpoint after each page", () => {
    it("calls saveCheckpoint once per page processed", async () => {
      const config = createMockConfig();
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;
      const stageRecords = config.stageRecords as ReturnType<typeof vi.fn>;
      const saveCheckpoint = config.checkpointManager
        .saveCheckpoint as ReturnType<typeof vi.fn>;

      fetchPage
        .mockResolvedValueOnce({
          data: [{ id: "1", name: "A" }],
          nextCursor: "cursor-2",
        })
        .mockResolvedValueOnce({
          data: [{ id: "2", name: "B" }],
          nextCursor: null,
        });

      stageRecords.mockResolvedValue({ staged: 1, skipped: 0 });

      await runGenericFetchLoop(config);

      expect(saveCheckpoint).toHaveBeenCalledTimes(2);

      // First checkpoint: after page 1, cursor points to next page
      const firstCall = saveCheckpoint.mock.calls[0][0];
      expect(firstCall.jobId).toBe("test-job-id");
      expect(firstCall.cursor).toBe("cursor-2");

      // Second checkpoint: after page 2, cursor is null (exhausted)
      const secondCall = saveCheckpoint.mock.calls[1][0];
      expect(secondCall.jobId).toBe("test-job-id");
      expect(secondCall.cursor).toBeNull();
    });

    it("checkpoint includes lastUpdatedAt timestamp", async () => {
      const config = createMockConfig();
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;
      const saveCheckpoint = config.checkpointManager
        .saveCheckpoint as ReturnType<typeof vi.fn>;

      fetchPage.mockResolvedValueOnce({
        data: [{ id: "1", name: "A" }],
        nextCursor: null,
      });

      await runGenericFetchLoop(config);

      const checkpointArg = saveCheckpoint.mock.calls[0][0];
      expect(checkpointArg.lastUpdatedAt).toBeDefined();
      expect(typeof checkpointArg.lastUpdatedAt).toBe("string");
    });
  });

  describe("resume from existing checkpoint", () => {
    it("starts fetching from the checkpoint cursor when checkpoint exists", async () => {
      const config = createMockConfig();
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;
      const loadCheckpoint = config.checkpointManager
        .loadCheckpoint as ReturnType<typeof vi.fn>;

      loadCheckpoint.mockResolvedValue({
        jobId: "test-job-id",
        cursor: "resume-cursor",
        progress: { processed: 10, imported: 8, skipped: 2, failed: 0 },
        lastUpdatedAt: "2025-01-15T10:05:00.000Z",
      });

      fetchPage.mockResolvedValueOnce({
        data: [{ id: "11", name: "K" }],
        nextCursor: null,
      });

      await runGenericFetchLoop(config);

      // fetchPage should start from the checkpoint cursor
      expect(fetchPage).toHaveBeenCalledTimes(1);
      expect(fetchPage).toHaveBeenCalledWith("resume-cursor", 100);
    });

    it("accumulates progress on top of checkpoint progress", async () => {
      const config = createMockConfig();
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;
      const stageRecords = config.stageRecords as ReturnType<typeof vi.fn>;
      const loadCheckpoint = config.checkpointManager
        .loadCheckpoint as ReturnType<typeof vi.fn>;
      const saveCheckpoint = config.checkpointManager
        .saveCheckpoint as ReturnType<typeof vi.fn>;

      loadCheckpoint.mockResolvedValue({
        jobId: "test-job-id",
        cursor: "resume-cursor",
        progress: { processed: 10, imported: 8, skipped: 2, failed: 0 },
        lastUpdatedAt: "2025-01-15T10:05:00.000Z",
      });

      fetchPage.mockResolvedValueOnce({
        data: [
          { id: "11", name: "K" },
          { id: "12", name: "L" },
        ],
        nextCursor: null,
      });

      stageRecords.mockResolvedValue({ staged: 1, skipped: 1 });

      await runGenericFetchLoop(config);

      expect(saveCheckpoint).toHaveBeenCalledWith(
        expect.objectContaining({
          progress: { processed: 12, imported: 9, skipped: 3, failed: 0 },
        }),
      );
    });
  });

  describe("timeout detection returns 'continue'", () => {
    it("returns 'continue' when elapsed time exceeds timeoutThresholdMs", async () => {
      const config = createMockConfig({
        startTime: Date.now() - 59_000, // 59s elapsed already
        timeoutThresholdMs: 60_000,
      });
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;

      fetchPage.mockImplementation(async () => {
        // Advance time by 2 seconds during fetch
        await vi.advanceTimersByTimeAsync(2_000);
        return { data: [{ id: "1", name: "A" }], nextCursor: "more-data" };
      });

      const result = await runGenericFetchLoop(config);

      expect(result).toEqual({ status: "continue", jobId: "test-job-id" });
    });

    it("does not transition job to paused on timeout", async () => {
      const config = createMockConfig({
        startTime: Date.now() - 61_000, // already past threshold
        timeoutThresholdMs: 60_000,
      });
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;
      const transitionJob = config.jobManager.transitionJob as ReturnType<
        typeof vi.fn
      >;

      fetchPage.mockResolvedValueOnce({
        data: [{ id: "1", name: "A" }],
        nextCursor: "more-data",
      });

      await runGenericFetchLoop(config);

      expect(transitionJob).not.toHaveBeenCalled();
    });
  });

  describe("cursor exhaustion transitions to 'paused' and returns 'complete'", () => {
    it("transitions job to 'paused' when cursor is null", async () => {
      const config = createMockConfig();
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;
      const stageRecords = config.stageRecords as ReturnType<typeof vi.fn>;
      const transitionJob = config.jobManager.transitionJob as ReturnType<
        typeof vi.fn
      >;

      fetchPage.mockResolvedValueOnce({
        data: [{ id: "1", name: "A" }],
        nextCursor: null,
      });
      stageRecords.mockResolvedValue({ staged: 1, skipped: 0 });

      const result = await runGenericFetchLoop(config);

      expect(result).toEqual({ status: "complete", jobId: "test-job-id" });
      expect(transitionJob).toHaveBeenCalledTimes(1);
      expect(transitionJob).toHaveBeenCalledWith("test-job-id", "paused", {
        processed: 1,
        imported: 1,
        skipped: 0,
        failed: 0,
      });
    });
  });

  describe("throws when job not found", () => {
    it("throws an error when getJob returns null", async () => {
      const config = createMockConfig();
      const getJob = config.jobManager.getJob as ReturnType<typeof vi.fn>;
      getJob.mockResolvedValue(null);

      await expect(runGenericFetchLoop(config)).rejects.toThrow(
        "Job test-job-id not found",
      );
    });
  });

  describe("progress accumulates across pages", () => {
    it("accumulates imported, skipped, and processed counts from stageRecords", async () => {
      const config = createMockConfig();
      const fetchPage = config.fetchPage as ReturnType<typeof vi.fn>;
      const stageRecords = config.stageRecords as ReturnType<typeof vi.fn>;
      const transitionJob = config.jobManager.transitionJob as ReturnType<
        typeof vi.fn
      >;

      fetchPage
        .mockResolvedValueOnce({
          data: [
            { id: "1", name: "A" },
            { id: "2", name: "B" },
            { id: "3", name: "C" },
          ],
          nextCursor: "cursor-2",
        })
        .mockResolvedValueOnce({
          data: [
            { id: "4", name: "D" },
            { id: "5", name: "E" },
          ],
          nextCursor: null,
        });

      stageRecords
        .mockResolvedValueOnce({ staged: 2, skipped: 1 })
        .mockResolvedValueOnce({ staged: 1, skipped: 1 });

      await runGenericFetchLoop(config);

      // Final progress: page1 (3 records: 2 staged, 1 skipped) + page2 (2 records: 1 staged, 1 skipped)
      expect(transitionJob).toHaveBeenCalledWith("test-job-id", "paused", {
        processed: 5,
        imported: 3,
        skipped: 2,
        failed: 0,
      });
    });
  });
});
