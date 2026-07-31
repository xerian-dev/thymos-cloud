import { describe, it, expect, vi, beforeEach } from "vitest";

const mockSend = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env.TABLE_NAME = "test-shop-table";
  process.env.PRICING_TABLE_NAME = "test-pricing-table";
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {},
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: {
    from: () => ({ send: mockSend }),
  },
  ScanCommand: class {
    constructor(public input: unknown) {}
  },
  QueryCommand: class {
    constructor(public input: unknown) {}
  },
  PutCommand: class {
    constructor(public input: unknown) {}
  },
}));

// Stable UUID for adjustment events
vi.stubGlobal("crypto", { randomUUID: () => "test-uuid-0001" });

interface PutInput {
  TableName: string;
  Item: Record<string, unknown>;
}

interface CommandInput {
  input: {
    TableName?: string;
    FilterExpression?: string;
    IndexName?: string;
    KeyConditionExpression?: string;
  };
}

describe("aggregator/handler — description-based refs", () => {
  const putCommands: PutInput[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    putCommands.length = 0;

    // Mock responses for scan/query/put commands
    mockSend.mockImplementation((command: CommandInput) => {
      const input = command.input;

      // ScanCommand for items (PK begins_with ITEM# and SK = METADATA)
      if (
        input.FilterExpression?.includes('begins_with(PK, :prefix) AND SK = :sk') &&
        input.TableName === "test-shop-table"
      ) {
        return Promise.resolve({
          Items: buildTestItems(),
          LastEvaluatedKey: undefined,
        });
      }

      // ScanCommand for sale line items
      if (
        input.FilterExpression?.includes('begins_with(PK, :prefix) AND begins_with(SK, :skPrefix)') &&
        input.TableName === "test-shop-table"
      ) {
        return Promise.resolve({
          Items: buildTestLineItems(),
          LastEvaluatedKey: undefined,
        });
      }

      // QueryCommand for existing pricing refs (GSI1)
      if (input.IndexName === "GSI1" && input.KeyConditionExpression?.includes("GSI1PK")) {
        return Promise.resolve({
          Items: [],
          LastEvaluatedKey: undefined,
        });
      }

      // PutCommand — capture all writes
      if ("Item" in input) {
        putCommands.push(input as unknown as PutInput);
        return Promise.resolve({});
      }

      return Promise.resolve({});
    });
  });

  it("produces description-based refs with PK pattern PRICING_REF#<brand>#DESC#<description>", async () => {
    const { handler } = await import("../../src/aggregator/handler");
    await handler();

    const descRefs = putCommands.filter(
      (cmd) =>
        cmd.TableName === "test-pricing-table" &&
        typeof cmd.Item.PK === "string" &&
        cmd.Item.PK.includes("#DESC#"),
    );

    expect(descRefs.length).toBeGreaterThanOrEqual(2);

    const hoseRef = descRefs.find(
      (cmd) => cmd.Item.PK === "PRICING_REF#Nike#DESC#Hose",
    );
    expect(hoseRef).toBeDefined();
    expect(hoseRef!.Item.PK).toBe("PRICING_REF#Nike#DESC#Hose");

    const sandalenRef = descRefs.find(
      (cmd) => cmd.Item.PK === "PRICING_REF#Nike#DESC#Sandalen",
    );
    expect(sandalenRef).toBeDefined();
    expect(sandalenRef!.Item.PK).toBe("PRICING_REF#Nike#DESC#Sandalen");
  });

  it("populates totalItems and unsoldCount on description-based refs", async () => {
    const { handler } = await import("../../src/aggregator/handler");
    await handler();

    const hoseRef = putCommands.find(
      (cmd) =>
        cmd.TableName === "test-pricing-table" &&
        cmd.Item.PK === "PRICING_REF#Nike#DESC#Hose",
    );
    expect(hoseRef).toBeDefined();
    // 3 items: 2 sold + 1 active
    expect(hoseRef!.Item.totalItems).toBe(3);
    expect(hoseRef!.Item.unsoldCount).toBe(1);
    expect(typeof hoseRef!.Item.totalItems).toBe("number");
    expect(typeof hoseRef!.Item.unsoldCount).toBe("number");

    const sandalenRef = putCommands.find(
      (cmd) =>
        cmd.TableName === "test-pricing-table" &&
        cmd.Item.PK === "PRICING_REF#Nike#DESC#Sandalen",
    );
    expect(sandalenRef).toBeDefined();
    // 1 item: 1 sold
    expect(sandalenRef!.Item.totalItems).toBe(1);
    expect(sandalenRef!.Item.unsoldCount).toBe(0);
    expect(typeof sandalenRef!.Item.totalItems).toBe("number");
    expect(typeof sandalenRef!.Item.unsoldCount).toBe("number");
  });

  it("sets description field on description-based refs", async () => {
    const { handler } = await import("../../src/aggregator/handler");
    await handler();

    const hoseRef = putCommands.find(
      (cmd) =>
        cmd.TableName === "test-pricing-table" &&
        cmd.Item.PK === "PRICING_REF#Nike#DESC#Hose",
    );
    expect(hoseRef!.Item.description).toBe("Hose");

    const sandalenRef = putCommands.find(
      (cmd) =>
        cmd.TableName === "test-pricing-table" &&
        cmd.Item.PK === "PRICING_REF#Nike#DESC#Sandalen",
    );
    expect(sandalenRef!.Item.description).toBe("Sandalen");
  });

  it("still produces category-based refs (backward compat)", async () => {
    const { handler } = await import("../../src/aggregator/handler");
    await handler();

    const catRef = putCommands.find(
      (cmd) =>
        cmd.TableName === "test-pricing-table" &&
        typeof cmd.Item.PK === "string" &&
        cmd.Item.PK === "PRICING_REF#Nike#cat-1",
    );
    expect(catRef).toBeDefined();
    expect(catRef!.Item.brand).toBe("Nike");
    expect(catRef!.Item.categoryId).toBe("cat-1");
  });

  it("populates totalItems and unsoldCount on category-based refs", async () => {
    const { handler } = await import("../../src/aggregator/handler");
    await handler();

    const catRef = putCommands.find(
      (cmd) =>
        cmd.TableName === "test-pricing-table" &&
        typeof cmd.Item.PK === "string" &&
        cmd.Item.PK === "PRICING_REF#Nike#cat-1",
    );
    expect(catRef).toBeDefined();
    // All 5 items in category: 4 sold, 1 active
    expect(catRef!.Item.totalItems).toBe(5);
    expect(catRef!.Item.unsoldCount).toBe(1);
    expect(typeof catRef!.Item.totalItems).toBe("number");
    expect(typeof catRef!.Item.unsoldCount).toBe("number");
  });
});

/**
 * Build 5 test items:
 * - 3 with brand "Nike", categoryId "cat-1", description "Hose" (2 sold, 1 active)
 * - 1 with brand "Nike", categoryId "cat-1", description "Sandalen" (1 sold)
 * - 1 with brand "Nike", categoryId "cat-1", no description (1 sold)
 */
function buildTestItems() {
  return [
    {
      PK: "ITEM#item-1",
      uuid: "item-1",
      brand: "Nike",
      categoryId: "cat-1",
      categoryName: "Schuhe",
      description: "Hose",
      tagPrice: 5000,
      status: "sold",
      color: "Red",
      size: "M",
      createdBy: "emp-1",
      lastSold: new Date().toISOString(),
      daysOnShelf: 10,
    },
    {
      PK: "ITEM#item-2",
      uuid: "item-2",
      brand: "Nike",
      categoryId: "cat-1",
      categoryName: "Schuhe",
      description: "Hose",
      tagPrice: 6000,
      status: "sold",
      color: "Blue",
      size: "L",
      createdBy: "emp-1",
      lastSold: new Date().toISOString(),
      daysOnShelf: 15,
    },
    {
      PK: "ITEM#item-3",
      uuid: "item-3",
      brand: "Nike",
      categoryId: "cat-1",
      categoryName: "Schuhe",
      description: "Hose",
      tagPrice: 5500,
      status: "active",
      color: "Red",
      size: "M",
      createdBy: "emp-1",
      daysOnShelf: 5,
    },
    {
      PK: "ITEM#item-4",
      uuid: "item-4",
      brand: "Nike",
      categoryId: "cat-1",
      categoryName: "Schuhe",
      description: "Sandalen",
      tagPrice: 4000,
      status: "sold",
      color: "Black",
      size: "S",
      createdBy: "emp-2",
      lastSold: new Date().toISOString(),
      daysOnShelf: 20,
    },
    {
      PK: "ITEM#item-5",
      uuid: "item-5",
      brand: "Nike",
      categoryId: "cat-1",
      categoryName: "Schuhe",
      tagPrice: 7000,
      status: "sold",
      color: "White",
      size: "XL",
      createdBy: "emp-1",
      lastSold: new Date().toISOString(),
      daysOnShelf: 8,
    },
  ];
}

/**
 * Build sale line items matching the sold items above.
 */
function buildTestLineItems() {
  return [
    {
      PK: "SALE#sale-1",
      SK: "LINE_ITEM#li-1",
      itemId: "item-1",
      salePrice: 4500,
      discount: 0,
      createdAt: new Date().toISOString(),
    },
    {
      PK: "SALE#sale-1",
      SK: "LINE_ITEM#li-2",
      itemId: "item-2",
      salePrice: 5500,
      discount: 0,
      createdAt: new Date().toISOString(),
    },
    {
      PK: "SALE#sale-2",
      SK: "LINE_ITEM#li-3",
      itemId: "item-4",
      salePrice: 3500,
      discount: 500,
      createdAt: new Date().toISOString(),
    },
    {
      PK: "SALE#sale-3",
      SK: "LINE_ITEM#li-4",
      itemId: "item-5",
      salePrice: 6500,
      discount: 0,
      createdAt: new Date().toISOString(),
    },
  ];
}
