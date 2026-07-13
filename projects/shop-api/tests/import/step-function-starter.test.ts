import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Unit tests for step-function-starter.ts
 *
 * Regression coverage for a production bug: startStepFunction previously
 * only included a "type" field in the Step Function execution input when
 * explicitly passed (`...(type ? { type } : {})`), and item import call
 * sites never passed it. Meanwhile the Terraform state machine's
 * ProcessBatch/PrepareNextIteration states unconditionally extract
 * "$.type" via JSONPath. The net effect: sale import jobs were always
 * routed through the item code path (looking up ITEM_IMPORT#<jobId>
 * instead of SALE_IMPORT#<jobId> and failing with "job not found"), and
 * once the state machine required $.type, item jobs would have started
 * failing too since they never sent it.
 *
 * Fix: `type` now defaults to "item" and is always included in the
 * execution input.
 */

const mockSfnSend = vi.fn();

vi.mock("@aws-sdk/client-sfn", () => ({
  SFNClient: class MockSFNClient {
    send(...args: unknown[]) {
      return mockSfnSend(...args);
    }
  },
  StartExecutionCommand: class MockStartExecutionCommand {
    constructor(public input: unknown) {}
  },
}));

describe("step-function-starter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv(
      "STATE_MACHINE_ARN",
      "arn:aws:states:us-east-1:123456789012:stateMachine:test-loop",
    );
    mockSfnSend.mockReset();
    mockSfnSend.mockResolvedValue({});
  });

  it("defaults type to 'item' when no type argument is provided", async () => {
    const { startStepFunction } =
      await import("../../src/import/step-function-starter");

    await startStepFunction("job-1", "fetch");

    const call = mockSfnSend.mock.calls[0][0] as { input: { input: string } };
    const executionInput = JSON.parse(call.input.input);

    expect(executionInput.type).toBe("item");
    expect(executionInput.action).toBe("resume-internal");
    expect(executionInput.jobId).toBe("job-1");
    expect(executionInput.phase).toBe("fetch");
  });

  it("always includes 'type' in the execution input for item jobs (never omits it)", async () => {
    // This is the core regression: the Terraform state machine
    // unconditionally does "type.$" = "$.type", which throws a runtime
    // error if the field is absent. type must always be present.
    const { startStepFunction } =
      await import("../../src/import/step-function-starter");

    await startStepFunction("job-2", "sync");

    const call = mockSfnSend.mock.calls[0][0] as { input: { input: string } };
    const executionInput = JSON.parse(call.input.input);

    expect(executionInput).toHaveProperty("type");
    expect(typeof executionInput.type).toBe("string");
  });

  it("sends type 'sale' when explicitly passed", async () => {
    const { startStepFunction } =
      await import("../../src/import/step-function-starter");

    await startStepFunction("job-3", "fetch", "sale");

    const call = mockSfnSend.mock.calls[0][0] as { input: { input: string } };
    const executionInput = JSON.parse(call.input.input);

    expect(executionInput.type).toBe("sale");
  });

  it("throws when STATE_MACHINE_ARN is not configured", async () => {
    vi.stubEnv("STATE_MACHINE_ARN", "");

    const { startStepFunction } =
      await import("../../src/import/step-function-starter");

    await expect(startStepFunction("job-4", "fetch", "sale")).rejects.toThrow(
      /STATE_MACHINE_ARN/,
    );
  });
});
