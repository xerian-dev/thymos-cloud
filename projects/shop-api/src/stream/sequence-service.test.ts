import { describe, it, expect, vi, beforeEach } from "vitest";

const sendMock = vi.fn();

vi.mock("./dynamodb-client", () => ({
  docClient: { send: (...args: unknown[]) => sendMock(...args) },
  TABLE_NAME: "TestShopTable",
}));

import { getNextSequenceNumber } from "./sequence-service";

describe("sequence-service", () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it("returns the incremented value for ACCOUNT", async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { value: 43 } });

    const result = await getNextSequenceNumber("ACCOUNT");

    expect(result).toBe(43);
    expect(sendMock).toHaveBeenCalledOnce();

    const command = sendMock.mock.calls[0][0];
    expect(command.input).toEqual({
      TableName: "TestShopTable",
      Key: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER" },
      UpdateExpression: "ADD #val :inc",
      ExpressionAttributeNames: { "#val": "value" },
      ExpressionAttributeValues: { ":inc": 1 },
      ReturnValues: "UPDATED_NEW",
    });
  });

  it("returns the incremented value for ITEM", async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { value: 1 } });

    const result = await getNextSequenceNumber("ITEM");

    expect(result).toBe(1);
    const command = sendMock.mock.calls[0][0];
    expect(command.input.Key).toEqual({ PK: "SEQUENCE#ITEM", SK: "COUNTER" });
  });

  it("returns the incremented value for SALE", async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { value: 999 } });

    const result = await getNextSequenceNumber("SALE");

    expect(result).toBe(999);
    const command = sendMock.mock.calls[0][0];
    expect(command.input.Key).toEqual({ PK: "SEQUENCE#SALE", SK: "COUNTER" });
  });

  it("throws when Attributes is undefined", async () => {
    sendMock.mockResolvedValueOnce({ Attributes: undefined });

    await expect(getNextSequenceNumber("ACCOUNT")).rejects.toThrow(
      "Unexpected DynamoDB response: no Attributes returned for SEQUENCE#ACCOUNT",
    );
  });

  it("throws when response has no Attributes key", async () => {
    sendMock.mockResolvedValueOnce({});

    await expect(getNextSequenceNumber("ITEM")).rejects.toThrow(
      "Unexpected DynamoDB response: no Attributes returned for SEQUENCE#ITEM",
    );
  });
});
