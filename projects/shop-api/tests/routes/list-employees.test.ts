import { describe, it, expect, vi, beforeEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
}));

import { listEmployees } from "../../src/routes/list-employees.js";
import { docClient } from "../../src/dynamodb-client.js";
import { encodeCursor } from "../../src/cursor-utils.js";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(
  queryStringParameters?: Record<string, string>,
): APIGatewayProxyEventV2 {
  return {
    routeKey: "GET /api/employees",
    rawPath: "/api/employees",
    rawQueryString: "",
    headers: {},
    queryStringParameters,
    requestContext: {
      accountId: "123",
      apiId: "api",
      domainName: "localhost",
      domainPrefix: "localhost",
      http: {
        method: "GET",
        path: "/api/employees",
        protocol: "HTTP/1.1",
        sourceIp: "127.0.0.1",
        userAgent: "test",
      },
      requestId: "req-1",
      routeKey: "GET /api/employees",
      stage: "$default",
      time: "01/Jan/2024:00:00:00 +0000",
      timeEpoch: 0,
    },
    isBase64Encoded: false,
    version: "2.0",
  };
}

describe("listEmployees", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("pageSize defaults and validation", () => {
    it("uses default pageSize=20 when not provided", async () => {
      mockedSend.mockResolvedValueOnce({ Items: [] } as never);

      await listEmployees(makeEvent());

      const command = mockedSend.mock.calls[0][0];
      expect(command.input).toMatchObject({ Limit: 20 });
    });

    it("accepts pageSize=20", async () => {
      mockedSend.mockResolvedValueOnce({ Items: [] } as never);

      await listEmployees(makeEvent({ pageSize: "20" }));

      const command = mockedSend.mock.calls[0][0];
      expect(command.input).toMatchObject({ Limit: 20 });
    });

    it("accepts pageSize=50", async () => {
      mockedSend.mockResolvedValueOnce({ Items: [] } as never);

      await listEmployees(makeEvent({ pageSize: "50" }));

      const command = mockedSend.mock.calls[0][0];
      expect(command.input).toMatchObject({ Limit: 50 });
    });

    it("accepts pageSize=100", async () => {
      mockedSend.mockResolvedValueOnce({ Items: [] } as never);

      await listEmployees(makeEvent({ pageSize: "100" }));

      const command = mockedSend.mock.calls[0][0];
      expect(command.input).toMatchObject({ Limit: 100 });
    });
  });

  describe("GSI2 query parameters", () => {
    it("queries GSI2 with correct key condition GSI2PK = EMPLOYEES", async () => {
      mockedSend.mockResolvedValueOnce({ Items: [] } as never);

      await listEmployees(makeEvent());

      const command = mockedSend.mock.calls[0][0];
      expect(command.input).toMatchObject({
        TableName: "test-table",
        IndexName: "GSI2",
        KeyConditionExpression: "GSI2PK = :pk",
        ExpressionAttributeValues: { ":pk": "EMPLOYEES" },
        ScanIndexForward: true,
        Limit: 20,
      });
    });

    it("passes decoded cursor as ExclusiveStartKey", async () => {
      const startKey = {
        PK: "EMPLOYEE#uuid-1",
        SK: "METADATA",
        GSI2PK: "EMPLOYEES",
        GSI2SK: "EMPLOYEE#uuid-1",
      };
      const cursor = encodeCursor(startKey);

      mockedSend.mockResolvedValueOnce({ Items: [] } as never);

      await listEmployees(makeEvent({ cursor }));

      const command = mockedSend.mock.calls[0][0];
      expect(command.input).toMatchObject({
        IndexName: "GSI2",
        ExclusiveStartKey: startKey,
      });
    });
  });

  describe("response field mapping", () => {
    it("maps only uuid, name, sourceId, createdAt, updatedAt from DynamoDB items", async () => {
      mockedSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "EMPLOYEE#emp-uuid-1",
            SK: "METADATA",
            uuid: "emp-uuid-1",
            name: "Jane Smith",
            sourceId: "cc-emp-abc",
            createdAt: "2024-01-15T10:30:00.000Z",
            updatedAt: "2024-01-15T10:30:00.000Z",
            GSI2PK: "EMPLOYEES",
            GSI2SK: "EMPLOYEE#emp-uuid-1",
          },
        ],
      } as never);

      const result = await listEmployees(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.employees).toHaveLength(1);
      expect(body.employees[0]).toEqual({
        uuid: "emp-uuid-1",
        name: "Jane Smith",
        sourceId: "cc-emp-abc",
        createdAt: "2024-01-15T10:30:00.000Z",
        updatedAt: "2024-01-15T10:30:00.000Z",
      });
    });

    it("does not include PK, SK, GSI2PK, or GSI2SK in response", async () => {
      mockedSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "EMPLOYEE#emp-uuid-2",
            SK: "METADATA",
            uuid: "emp-uuid-2",
            name: "John Doe",
            sourceId: "cc-emp-xyz",
            createdAt: "2024-02-01T08:00:00.000Z",
            updatedAt: "2024-02-01T08:00:00.000Z",
            GSI2PK: "EMPLOYEES",
            GSI2SK: "EMPLOYEE#emp-uuid-2",
            someExtraField: "should-not-appear",
          },
        ],
      } as never);

      const result = await listEmployees(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      const employee = body.employees[0];
      expect(employee).not.toHaveProperty("PK");
      expect(employee).not.toHaveProperty("SK");
      expect(employee).not.toHaveProperty("GSI2PK");
      expect(employee).not.toHaveProperty("GSI2SK");
      expect(employee).not.toHaveProperty("someExtraField");
    });

    it("defaults name and sourceId to empty string when missing", async () => {
      mockedSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "EMPLOYEE#emp-uuid-3",
            SK: "METADATA",
            uuid: "emp-uuid-3",
            createdAt: "2024-03-01T12:00:00.000Z",
            updatedAt: "2024-03-01T12:00:00.000Z",
            GSI2PK: "EMPLOYEES",
            GSI2SK: "EMPLOYEE#emp-uuid-3",
          },
        ],
      } as never);

      const result = await listEmployees(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.employees[0].name).toBe("");
      expect(body.employees[0].sourceId).toBe("");
    });
  });

  describe("nextCursor and hasMore behavior", () => {
    it("returns nextCursor=null and hasMore=false when no LastEvaluatedKey", async () => {
      mockedSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "EMPLOYEE#emp-uuid-1",
            SK: "METADATA",
            uuid: "emp-uuid-1",
            name: "Jane",
            sourceId: "src-1",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            GSI2PK: "EMPLOYEES",
            GSI2SK: "EMPLOYEE#emp-uuid-1",
          },
        ],
      } as never);

      const result = await listEmployees(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.nextCursor).toBeNull();
      expect(body.hasMore).toBe(false);
    });

    it("returns nextCursor as string and hasMore=true when LastEvaluatedKey exists", async () => {
      mockedSend.mockResolvedValueOnce({
        Items: [
          {
            PK: "EMPLOYEE#emp-uuid-1",
            SK: "METADATA",
            uuid: "emp-uuid-1",
            name: "Jane",
            sourceId: "src-1",
            createdAt: "2024-01-01T00:00:00.000Z",
            updatedAt: "2024-01-01T00:00:00.000Z",
            GSI2PK: "EMPLOYEES",
            GSI2SK: "EMPLOYEE#emp-uuid-1",
          },
        ],
        LastEvaluatedKey: {
          PK: "EMPLOYEE#emp-uuid-1",
          SK: "METADATA",
          GSI2PK: "EMPLOYEES",
          GSI2SK: "EMPLOYEE#emp-uuid-1",
        },
      } as never);

      const result = await listEmployees(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body.hasMore).toBe(true);
      expect(body.nextCursor).toEqual(expect.any(String));
      expect(body.nextCursor).not.toBeNull();
    });

    it("returns empty employees array when no items exist", async () => {
      mockedSend.mockResolvedValueOnce({ Items: [] } as never);

      const result = await listEmployees(makeEvent());

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body as string);
      expect(body).toEqual({
        employees: [],
        nextCursor: null,
        hasMore: false,
      });
    });
  });

  describe("error handling", () => {
    it("returns 500 on DynamoDB error", async () => {
      mockedSend.mockRejectedValueOnce(new Error("DynamoDB unavailable"));

      const result = await listEmployees(makeEvent());

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body as string);
      expect(body).toEqual({ error: "internal_error" });
    });
  });
});
