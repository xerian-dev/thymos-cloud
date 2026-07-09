import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class MockLambdaClient {
    send = mockSend;
  },
  InvokeCommand: class MockInvokeCommand {
    constructor(public input: unknown) {}
  },
}));

describe("self-invoker", () => {
  let invokeSelf: typeof import("../../src/import/self-invoker").invokeSelf;

  beforeEach(async () => {
    mockSend.mockReset();
    mockSend.mockResolvedValue({});
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  async function loadModule() {
    const mod = await import("../../src/import/self-invoker");
    invokeSelf = mod.invokeSelf;
  }

  describe("payload construction", () => {
    it("calls InvokeCommand with payload containing action and jobId encoded as Uint8Array", async () => {
      vi.stubEnv("FUNCTION_NAME", "my-import-function");
      await loadModule();

      await invokeSelf("job-abc-123");

      expect(mockSend).toHaveBeenCalledTimes(1);
      const command = mockSend.mock.calls[0][0];
      const payload = JSON.parse(
        new TextDecoder().decode(command.input.Payload),
      );
      expect(payload).toEqual({
        action: "resume-internal",
        jobId: "job-abc-123",
        phase: "fetch",
      });
    });

    it("encodes payload as Uint8Array", async () => {
      vi.stubEnv("FUNCTION_NAME", "my-import-function");
      await loadModule();

      await invokeSelf("job-xyz");

      const command = mockSend.mock.calls[0][0];
      expect(command.input.Payload).toBeInstanceOf(Uint8Array);
    });
  });

  describe("InvocationType", () => {
    it("uses Event invocation type for async fire-and-forget", async () => {
      vi.stubEnv("FUNCTION_NAME", "my-import-function");
      await loadModule();

      await invokeSelf("job-123");

      const command = mockSend.mock.calls[0][0];
      expect(command.input.InvocationType).toBe("Event");
    });
  });

  describe("function name resolution", () => {
    it("uses FUNCTION_NAME env var for FunctionName", async () => {
      vi.stubEnv("FUNCTION_NAME", "my-custom-function-name");
      await loadModule();

      await invokeSelf("job-123");

      const command = mockSend.mock.calls[0][0];
      expect(command.input.FunctionName).toBe("my-custom-function-name");
    });

    it("falls back to AWS_LAMBDA_FUNCTION_NAME when FUNCTION_NAME is not set", async () => {
      vi.stubEnv("AWS_LAMBDA_FUNCTION_NAME", "aws-lambda-fn-name");
      // Ensure FUNCTION_NAME is not set
      delete process.env.FUNCTION_NAME;
      await loadModule();

      await invokeSelf("job-456");

      const command = mockSend.mock.calls[0][0];
      expect(command.input.FunctionName).toBe("aws-lambda-fn-name");
    });

    it("throws if neither FUNCTION_NAME nor AWS_LAMBDA_FUNCTION_NAME is set", async () => {
      delete process.env.FUNCTION_NAME;
      delete process.env.AWS_LAMBDA_FUNCTION_NAME;
      await loadModule();

      await expect(invokeSelf("job-789")).rejects.toThrow(
        "Neither FUNCTION_NAME nor AWS_LAMBDA_FUNCTION_NAME environment variable is set",
      );
    });
  });

  describe("invocation failure handling", () => {
    it("propagates errors when Lambda invocation fails", async () => {
      vi.stubEnv("FUNCTION_NAME", "my-import-function");
      await loadModule();

      const lambdaError = new Error("Lambda service unavailable");
      mockSend.mockRejectedValueOnce(lambdaError);

      await expect(invokeSelf("job-fail")).rejects.toThrow(
        "Lambda service unavailable",
      );
    });
  });

  describe("structured log output", () => {
    it("logs structured JSON containing jobId via console.info", async () => {
      vi.stubEnv("FUNCTION_NAME", "my-import-function");
      await loadModule();

      const consoleSpy = vi.spyOn(console, "info").mockImplementation(() => {});

      await invokeSelf("job-log-test");

      expect(consoleSpy).toHaveBeenCalledTimes(1);
      const logOutput = JSON.parse(consoleSpy.mock.calls[0][0] as string);
      expect(logOutput.jobId).toBe("job-log-test");
      expect(logOutput.functionName).toBe("my-import-function");
      expect(logOutput.level).toBe("INFO");

      consoleSpy.mockRestore();
    });
  });
});
