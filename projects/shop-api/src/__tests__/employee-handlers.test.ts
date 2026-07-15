import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockSend = vi.hoisted(() => vi.fn());

vi.mock("../dynamodb-client", () => ({
  docClient: { send: mockSend },
  TABLE_NAME: "test-table",
}));

import { getEmployee } from "../routes/get-employee";
import { batchGetEmployees } from "../routes/batch-get-employees";

beforeEach(() => {
  vi.clearAllMocks();
});

function buildGetEmployeeEvent(uuid?: string): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/employees/{uuid}",
    rawPath: `/api/employees/${uuid ?? ""}`,
    rawQueryString: "",
    headers: {},
    queryStringParameters: null,
    isBase64Encoded: false,
    requestContext: {} as unknown,
    body: null,
    pathParameters: uuid ? { uuid } : null,
    stageVariables: null,
    version: "2.0",
  } as unknown as APIGatewayProxyEventV2;
}

function buildBatchEvent(body: string): APIGatewayProxyEventV2 {
  return {
    routeKey: "POST /api/employees/batch",
    rawPath: "/api/employees/batch",
    rawQueryString: "",
    headers: { "content-type": "application/json" },
    queryStringParameters: null,
    isBase64Encoded: false,
    requestContext: {} as unknown,
    body,
    pathParameters: null,
    stageVariables: null,
    version: "2.0",
  } as unknown as APIGatewayProxyEventV2;
}

describe("getEmployee", () => {
  it("returns 400 missing_uuid when no UUID path parameter is provided", async () => {
    const event = buildGetEmployeeEvent(undefined);

    const result = await getEmployee(event);

    expect(result).toEqual({
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "missing_uuid" }),
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 404 not_found when employee does not exist", async () => {
    mockSend.mockResolvedValueOnce({ Item: undefined });

    const event = buildGetEmployeeEvent("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    const result = await getEmployee(event);

    expect(result).toEqual({
      statusCode: 404,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "not_found" }),
    });
  });

  it("returns 200 with mapped employee record on success", async () => {
    const employeeRecord = {
      PK: "EMPLOYEE#aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      SK: "METADATA",
      uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      name: "Jane Doe",
      sourceId: "src-123",
      createdAt: "2024-01-15T10:00:00.000Z",
      updatedAt: "2024-02-20T14:30:00.000Z",
    };
    mockSend.mockResolvedValueOnce({ Item: employeeRecord });

    const event = buildGetEmployeeEvent("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");

    const result = await getEmployee(event);

    expect(result).toEqual({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        uuid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        name: "Jane Doe",
        sourceId: "src-123",
        createdAt: "2024-01-15T10:00:00.000Z",
        updatedAt: "2024-02-20T14:30:00.000Z",
      }),
    });
  });
});

describe("batchGetEmployees", () => {
  it("returns 400 invalid_json when body is not valid JSON", async () => {
    const event = buildBatchEvent("not json");

    const result = await batchGetEmployees(event);

    expect(result).toEqual({
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "invalid_json" }),
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 400 validation_error when uuids field is missing", async () => {
    const event = buildBatchEvent(JSON.stringify({}));

    const result = await batchGetEmployees(event);

    expect(result).toEqual({
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "validation_error" }),
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 200 with empty employees array when uuids array is empty", async () => {
    const event = buildBatchEvent(JSON.stringify({ uuids: [] }));

    const result = await batchGetEmployees(event);

    expect(result).toEqual({
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ employees: [] }),
    });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("returns 400 too_many_uuids when array exceeds 100 items", async () => {
    const uuids = Array.from(
      { length: 101 },
      (_, i) => `uuid-${String(i).padStart(4, "0")}`,
    );
    const event = buildBatchEvent(JSON.stringify({ uuids }));

    const result = await batchGetEmployees(event);

    expect(result).toEqual({
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "too_many_uuids" }),
    });
    expect(mockSend).not.toHaveBeenCalled();
  });
});
