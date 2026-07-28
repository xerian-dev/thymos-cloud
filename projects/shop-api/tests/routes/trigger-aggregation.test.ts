import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("@aws-sdk/client-lambda", () => ({
  LambdaClient: class {
    send = mockSend;
  },
  InvokeCommand: vi.fn(),
}));

import { triggerAggregation } from "../../src/routes/trigger-aggregation.js";
import { InvokeCommand } from "@aws-sdk/client-lambda";

const mockedInvokeCommand = vi.mocked(InvokeCommand);

function makeEvent(): APIGatewayProxyEventV2 {
  return {
    routeKey: "POST /api/pricing/aggregate",
  } as APIGatewayProxyEventV2;
}

describe("POST /api/pricing/aggregate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 200 with success message when Lambda invocation succeeds", async () => {
    mockSend.mockResolvedValueOnce({});

    const response = await triggerAggregation(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({
      success: true,
      message: "Aggregation triggered",
    });
  });

  it("invokes the aggregator Lambda with Event invocation type", async () => {
    mockSend.mockResolvedValueOnce({});

    await triggerAggregation(makeEvent());

    expect(mockedInvokeCommand).toHaveBeenCalledWith({
      FunctionName: expect.any(String),
      InvocationType: "Event",
    });
  });

  it("returns 500 when Lambda invocation fails", async () => {
    mockSend.mockRejectedValueOnce(new Error("Lambda error"));

    const response = await triggerAggregation(makeEvent());

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ error: "internal_error" });
  });
});
