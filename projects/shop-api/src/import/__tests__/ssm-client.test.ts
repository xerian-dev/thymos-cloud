import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-ssm", () => {
  return {
    SSMClient: class {
      send = mockSend;
    },
    GetParameterCommand: class {
      constructor(public input: unknown) {}
    },
  };
});

import { getConsignCloudApiKey } from "../ssm-client";

describe("ssm-client", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, SSM_API_KEY_PATH: "/test/path/api-key" };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns the API key when parameter is found", async () => {
    mockSend.mockResolvedValueOnce({
      Parameter: { Value: "test-api-key" },
    });

    const result = await getConsignCloudApiKey();

    expect(result).toBe("test-api-key");
  });

  it("throws error when parameter is not found", async () => {
    mockSend.mockResolvedValueOnce({});

    await expect(getConsignCloudApiKey()).rejects.toThrow(
      /parameter not found/i,
    );
  });

  it("throws error when parameter value is empty", async () => {
    mockSend.mockResolvedValueOnce({
      Parameter: { Value: "" },
    });

    await expect(getConsignCloudApiKey()).rejects.toThrow(/empty value/i);
  });

  it("throws error when SSM_API_KEY_PATH env var is not set", async () => {
    delete process.env.SSM_API_KEY_PATH;

    await expect(getConsignCloudApiKey()).rejects.toThrow(/SSM_API_KEY_PATH/i);
  });
});
