import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

vi.mock("../../src/dynamodb-client.js", () => ({
  docClient: { send: vi.fn() },
  TABLE_NAME: "test-table",
}));

import {
  listCanonicalBrands,
  listCanonicalColors,
  _resetCaches,
} from "../../src/routes/canonical-lists.js";
import { docClient } from "../../src/dynamodb-client.js";

const mockedSend = vi.mocked(docClient.send);

function makeEvent(routeKey: string): APIGatewayProxyEventV2 {
  return { routeKey } as APIGatewayProxyEventV2;
}

describe("GET /api/pricing/canonical/brands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCaches();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns sorted brand names from DynamoDB", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        { PK: "CANONICAL#BRANDS", SK: "BRAND#Zara", name: "Zara" },
        { PK: "CANONICAL#BRANDS", SK: "BRAND#Adidas", name: "Adidas" },
        { PK: "CANONICAL#BRANDS", SK: "BRAND#Nike", name: "Nike" },
      ],
    } as never);

    const response = await listCanonicalBrands(
      makeEvent("GET /api/pricing/canonical/brands"),
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ brands: ["Adidas", "Nike", "Zara"] });
  });

  it("returns cached result on subsequent calls within TTL", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [{ PK: "CANONICAL#BRANDS", SK: "BRAND#Nike", name: "Nike" }],
    } as never);

    // First call - fetches from DynamoDB
    await listCanonicalBrands(makeEvent("GET /api/pricing/canonical/brands"));

    // Second call - should use cache
    const response = await listCanonicalBrands(
      makeEvent("GET /api/pricing/canonical/brands"),
    );

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ brands: ["Nike"] });
  });

  it("re-fetches from DynamoDB after cache expires", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [{ PK: "CANONICAL#BRANDS", SK: "BRAND#Nike", name: "Nike" }],
    } as never);

    // First call
    await listCanonicalBrands(makeEvent("GET /api/pricing/canonical/brands"));

    // Advance time past TTL (5 minutes)
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);

    mockedSend.mockResolvedValueOnce({
      Items: [
        { PK: "CANONICAL#BRANDS", SK: "BRAND#Nike", name: "Nike" },
        { PK: "CANONICAL#BRANDS", SK: "BRAND#Puma", name: "Puma" },
      ],
    } as never);

    const response = await listCanonicalBrands(
      makeEvent("GET /api/pricing/canonical/brands"),
    );

    expect(mockedSend).toHaveBeenCalledTimes(2);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ brands: ["Nike", "Puma"] });
  });

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const response = await listCanonicalBrands(
      makeEvent("GET /api/pricing/canonical/brands"),
    );

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ error: "internal_error" });
  });

  it("handles paginated DynamoDB responses", async () => {
    mockedSend
      .mockResolvedValueOnce({
        Items: [{ PK: "CANONICAL#BRANDS", SK: "BRAND#Adidas", name: "Adidas" }],
        LastEvaluatedKey: { PK: "CANONICAL#BRANDS", SK: "BRAND#Adidas" },
      } as never)
      .mockResolvedValueOnce({
        Items: [{ PK: "CANONICAL#BRANDS", SK: "BRAND#Nike", name: "Nike" }],
      } as never);

    const response = await listCanonicalBrands(
      makeEvent("GET /api/pricing/canonical/brands"),
    );

    expect(mockedSend).toHaveBeenCalledTimes(2);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ brands: ["Adidas", "Nike"] });
  });

  it("returns empty array when no brands exist", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [],
    } as never);

    const response = await listCanonicalBrands(
      makeEvent("GET /api/pricing/canonical/brands"),
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ brands: [] });
  });
});

describe("GET /api/pricing/canonical/colors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _resetCaches();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns sorted color names from DynamoDB", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [
        { PK: "CANONICAL#COLORS", SK: "COLOR#Red", name: "Red" },
        { PK: "CANONICAL#COLORS", SK: "COLOR#Blue", name: "Blue" },
        { PK: "CANONICAL#COLORS", SK: "COLOR#Black", name: "Black" },
      ],
    } as never);

    const response = await listCanonicalColors(
      makeEvent("GET /api/pricing/canonical/colors"),
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ colors: ["Black", "Blue", "Red"] });
  });

  it("returns cached result on subsequent calls within TTL", async () => {
    mockedSend.mockResolvedValueOnce({
      Items: [{ PK: "CANONICAL#COLORS", SK: "COLOR#Red", name: "Red" }],
    } as never);

    await listCanonicalColors(makeEvent("GET /api/pricing/canonical/colors"));

    const response = await listCanonicalColors(
      makeEvent("GET /api/pricing/canonical/colors"),
    );

    expect(mockedSend).toHaveBeenCalledTimes(1);
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ colors: ["Red"] });
  });

  it("returns 500 on DynamoDB error", async () => {
    mockedSend.mockRejectedValueOnce(new Error("DynamoDB error"));

    const response = await listCanonicalColors(
      makeEvent("GET /api/pricing/canonical/colors"),
    );

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body as string);
    expect(body).toEqual({ error: "internal_error" });
  });
});
