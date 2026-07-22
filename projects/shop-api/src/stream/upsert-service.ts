import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

import { docClient, TABLE_NAME } from "./dynamodb-client";
import { findBySourceId } from "./source-id-lookup";
import { getNextSequenceNumber, seedSequenceCounter } from "./sequence-service";
import type { MappedAccount } from "./account-mapper";
import type { MappedItem } from "./item-mapper";
import type { MappedSale, MappedLineItem } from "./sale-mapper";

export interface UpsertResult {
  action: "created" | "updated" | "skipped";
}

function isConditionalCheckFailed(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "ConditionalCheckFailedException";
  }
  return false;
}

function isTransactionCanceledException(error: unknown): boolean {
  if (error instanceof Error) {
    return error.name === "TransactionCanceledException";
  }
  return false;
}

/**
 * Resolves an existing Employee by sourceId, or creates one if not found.
 * Returns the Employee UUID.
 */
async function resolveOrCreateEmployee(
  sourceId: string,
  name: string,
): Promise<string> {
  const existing = await findBySourceId(sourceId);
  if (existing) {
    // Extract UUID from PK pattern "EMPLOYEE#<uuid>"
    return existing.PK.replace("EMPLOYEE#", "");
  }

  const uuid = randomUUID();
  const now = new Date().toISOString();

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `EMPLOYEE#${uuid}`,
          SK: "METADATA",
          uuid,
          name,
          sourceId,
          GSI2PK: "EMPLOYEES",
          GSI2SK: `EMPLOYEE#${uuid}`,
          createdAt: now,
          updatedAt: now,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return uuid;
  } catch (error: unknown) {
    if (isConditionalCheckFailed(error)) {
      // Concurrent creation — re-query to get the UUID
      const requeried = await findBySourceId(sourceId);
      if (requeried) {
        return requeried.PK.replace("EMPLOYEE#", "");
      }
      // Fallback: return the UUID we generated (shouldn't happen)
      return uuid;
    }
    throw error;
  }
}

/**
 * Resolves an existing Category by sourceId, or creates one if not found.
 * Returns the Category UUID.
 */
async function resolveOrCreateCategory(
  sourceId: string,
  name: string,
): Promise<string> {
  const existing = await findBySourceId(sourceId);
  if (existing) {
    // Extract UUID from PK pattern "CATEGORY#<uuid>"
    return existing.PK.replace("CATEGORY#", "");
  }

  const uuid = randomUUID();
  const now = new Date().toISOString();

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `CATEGORY#${uuid}`,
          SK: "METADATA",
          uuid,
          name,
          sourceId,
          createdAt: now,
          updatedAt: now,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return uuid;
  } catch (error: unknown) {
    if (isConditionalCheckFailed(error)) {
      // Concurrent creation — re-query to get the UUID
      const requeried = await findBySourceId(sourceId);
      if (requeried) {
        return requeried.PK.replace("CATEGORY#", "");
      }
      return uuid;
    }
    throw error;
  }
}

function extractAccountSourceId(
  raw: Record<string, unknown>,
): string | undefined {
  // Try nested object: raw.account.id
  const account = raw.account;
  if (
    account != null &&
    typeof account === "object" &&
    !Array.isArray(account)
  ) {
    const accountObj = account as Record<string, unknown>;
    if (typeof accountObj.id === "string" && accountObj.id) {
      return accountObj.id;
    }
  }
  // Fallback: raw.account_id (flat string)
  if (typeof raw.account_id === "string" && raw.account_id) {
    return raw.account_id;
  }
  return undefined;
}

export async function upsertAccount(
  mapped: MappedAccount,
  raw: Record<string, unknown>,
): Promise<UpsertResult> {
  // Resolve or create Employee (side effect: ensures Employee record exists)
  const rawCreatedBy = raw.created_by;
  if (
    rawCreatedBy != null &&
    typeof rawCreatedBy === "object" &&
    !Array.isArray(rawCreatedBy)
  ) {
    const employee = rawCreatedBy as Record<string, unknown>;
    const employeeSourceId = typeof employee.id === "string" ? employee.id : "";
    const employeeName =
      typeof employee.name === "string" ? employee.name : "Unknown";
    if (employeeSourceId) {
      await resolveOrCreateEmployee(employeeSourceId, employeeName);
    }
  }

  // Build createdBy object from raw data (stored on Account as { id, name, userType })
  let createdBy: { id: string; name: string; userType: string } | undefined;
  if (
    rawCreatedBy != null &&
    typeof rawCreatedBy === "object" &&
    !Array.isArray(rawCreatedBy)
  ) {
    const employee = rawCreatedBy as Record<string, unknown>;
    const employeeId = typeof employee.id === "string" ? employee.id : "";
    const employeeName = typeof employee.name === "string" ? employee.name : "";
    const userType =
      typeof employee.user_type === "string" ? employee.user_type : "";
    if (employeeId) {
      createdBy = { id: employeeId, name: employeeName, userType };
    }
  }

  const existing = await findBySourceId(mapped.sourceId);

  if (existing) {
    const now = new Date().toISOString();

    let updateExpression =
      "SET firstName = :firstName, lastName = :lastName, #n = :name, company = :company, " +
      "street = :street, addressLine2 = :addressLine2, place = :place, " +
      "postcode = :postcode, canton = :canton, email = :email, " +
      "telephone = :telephone, balance = :balance, defaultSplit = :defaultSplit, " +
      "defaultTerms = :defaultTerms, defaultInventoryType = :defaultInventoryType, " +
      "emailNotificationsEnabled = :emailNotificationsEnabled, " +
      "isVendor = :isVendor, taxExempt = :taxExempt, tags = :tags, " +
      "lastSettlement = :lastSettlement, lastItemEntered = :lastItemEntered, " +
      "lastActivity = :lastActivity, locations = :locations, " +
      "updatedAt = :updatedAt";

    const expressionValues: Record<string, unknown> = {
      ":firstName": mapped.firstName,
      ":lastName": mapped.lastName,
      ":name": `${mapped.firstName} ${mapped.lastName}`.trim(),
      ":company": mapped.company,
      ":street": mapped.street,
      ":addressLine2": mapped.addressLine2,
      ":place": mapped.place,
      ":postcode": mapped.postcode,
      ":canton": mapped.canton,
      ":email": mapped.email,
      ":telephone": mapped.telephone,
      ":balance": mapped.balance,
      ":defaultSplit": mapped.defaultSplit,
      ":defaultTerms": mapped.defaultTerms,
      ":defaultInventoryType": mapped.defaultInventoryType,
      ":emailNotificationsEnabled": mapped.emailNotificationsEnabled,
      ":isVendor": mapped.isVendor,
      ":taxExempt": mapped.taxExempt,
      ":tags": mapped.tags,
      ":lastSettlement": mapped.lastSettlement,
      ":lastItemEntered": mapped.lastItemEntered,
      ":lastActivity": mapped.lastActivity,
      ":locations": mapped.locations,
      ":updatedAt": now,
    };

    if (createdBy) {
      updateExpression += ", createdBy = if_not_exists(createdBy, :createdBy)";
      expressionValues[":createdBy"] = createdBy;
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: existing.PK, SK: existing.SK },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: {
          "#n": "name",
        },
        ExpressionAttributeValues: expressionValues,
      }),
    );
    return { action: "updated" };
  }

  // Create new account
  const uuid = randomUUID();
  // Use the ConsignCloud account number as accountNumber (preserving the original numbering)
  const accountNumber =
    mapped.accountNumber > 0
      ? mapped.accountNumber
      : await getNextSequenceNumber("ACCOUNT");
  const now = new Date().toISOString();

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `ACCOUNT#${uuid}`,
          SK: "METADATA",
          uuid,
          accountNumber: String(accountNumber).padStart(7, "0"),
          GSI1PK: "ACCOUNT",
          GSI1SK: `ACCOUNT#${String(accountNumber).padStart(7, "0")}`,
          name: `${mapped.firstName} ${mapped.lastName}`.trim(),
          firstName: mapped.firstName,
          lastName: mapped.lastName,
          company: mapped.company,
          street: mapped.street,
          addressLine2: mapped.addressLine2,
          place: mapped.place,
          postcode: mapped.postcode,
          canton: mapped.canton,
          email: mapped.email,
          telephone: mapped.telephone,
          balance: mapped.balance,
          defaultSplit: mapped.defaultSplit,
          defaultTerms: mapped.defaultTerms,
          defaultInventoryType: mapped.defaultInventoryType,
          emailNotificationsEnabled: mapped.emailNotificationsEnabled,
          isVendor: mapped.isVendor,
          taxExempt: mapped.taxExempt,
          tags: mapped.tags,
          numberOfItems: 0,
          numberOfPurchases: 0,
          sourceId: mapped.sourceId,
          createdAt: mapped.createdAt || now,
          updatedAt: now,
          ...(createdBy && { createdBy }),
          ...(mapped.lastSettlement && {
            lastSettlement: mapped.lastSettlement,
          }),
          ...(mapped.lastItemEntered && {
            lastItemEntered: mapped.lastItemEntered,
          }),
          ...(mapped.lastActivity && { lastActivity: mapped.lastActivity }),
          ...(mapped.locations.length > 0 && { locations: mapped.locations }),
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );

    // Ensure sequence counter is at least as high as this imported account number
    try {
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: "SEQUENCE#ACCOUNT", SK: "COUNTER" },
          UpdateExpression: "SET #val = :newVal",
          ConditionExpression: "attribute_not_exists(#val) OR #val < :newVal",
          ExpressionAttributeNames: { "#val": "value" },
          ExpressionAttributeValues: { ":newVal": accountNumber },
        }),
      );
    } catch (error: unknown) {
      // ConditionalCheckFailedException means counter is already higher — that's fine
      if (
        !(
          error instanceof Error &&
          error.name === "ConditionalCheckFailedException"
        )
      ) {
        throw error;
      }
    }

    return { action: "created" };
  } catch (error: unknown) {
    if (isConditionalCheckFailed(error)) {
      return { action: "skipped" };
    }
    throw error;
  }
}

export async function upsertItem(
  mapped: MappedItem,
  raw: Record<string, unknown>,
): Promise<UpsertResult> {
  const existing = await findBySourceId(mapped.sourceId);

  if (existing) {
    const now = new Date().toISOString();

    // Resolve account for GSI2 update
    const accountSourceId = extractAccountSourceId(raw);
    let accountId = "";
    if (accountSourceId) {
      const accountRecord = await findBySourceId(accountSourceId);
      if (accountRecord) {
        accountId = accountRecord.PK.replace("ACCOUNT#", "");
      }
    }

    // Resolve category for GSI3 update
    let categoryId = "";
    const rawCategory = raw.category;
    if (
      rawCategory != null &&
      typeof rawCategory === "object" &&
      !Array.isArray(rawCategory)
    ) {
      const category = rawCategory as Record<string, unknown>;
      const categorySourceId =
        typeof category.id === "string" ? category.id : "";
      const categoryName =
        typeof category.name === "string" ? category.name : "Unknown";
      if (categorySourceId) {
        categoryId = await resolveOrCreateCategory(
          categorySourceId,
          categoryName,
        );
      }
    }

    // Build update expression dynamically
    let updateExpression =
      "SET title = :title, tagPrice = :tagPrice, quantity = :quantity, " +
      "split = :split, inventoryType = :inventoryType, terms = :terms, " +
      "taxExempt = :taxExempt, #st = :status, updatedAt = :updatedAt";

    const expressionValues: Record<string, unknown> = {
      ":title": mapped.title,
      ":tagPrice": mapped.tagPrice,
      ":quantity": mapped.quantity,
      ":split": mapped.split,
      ":inventoryType": mapped.inventoryType,
      ":terms": mapped.terms,
      ":taxExempt": mapped.taxExempt,
      ":status": mapped.status,
      ":updatedAt": now,
    };

    const expressionNames: Record<string, string> = {
      "#st": "status",
    };

    // Existing optional fields
    if (mapped.description) {
      updateExpression += ", description = :description";
      expressionValues[":description"] = mapped.description;
    }
    if (mapped.brand) {
      updateExpression += ", brand = :brand";
      expressionValues[":brand"] = mapped.brand;
    }
    if (mapped.color) {
      updateExpression += ", color = :color";
      expressionValues[":color"] = mapped.color;
    }
    if (mapped.size) {
      updateExpression += ", size = :size";
      expressionValues[":size"] = mapped.size;
    }
    if (mapped.shelf) {
      updateExpression += ", shelf = :shelf";
      expressionValues[":shelf"] = mapped.shelf;
    }
    if (mapped.tags) {
      updateExpression += ", tags = :tags";
      expressionValues[":tags"] = mapped.tags;
    }
    if (mapped.imageKeys) {
      updateExpression += ", imageKeys = :imageKeys";
      expressionValues[":imageKeys"] = mapped.imageKeys;
    }

    // New optional fields
    if (mapped.location) {
      updateExpression += ", #loc = :location";
      expressionValues[":location"] = mapped.location;
      expressionNames["#loc"] = "location";
    }
    if (mapped.details) {
      updateExpression += ", details = :details";
      expressionValues[":details"] = mapped.details;
    }
    if (mapped.scheduleStart) {
      updateExpression += ", scheduleStart = :scheduleStart";
      expressionValues[":scheduleStart"] = mapped.scheduleStart;
    }
    if (mapped.expirationDate) {
      updateExpression += ", expirationDate = :expirationDate";
      expressionValues[":expirationDate"] = mapped.expirationDate;
    }
    if (mapped.lastSold) {
      updateExpression += ", lastSold = :lastSold";
      expressionValues[":lastSold"] = mapped.lastSold;
    }
    if (mapped.lastViewed) {
      updateExpression += ", lastViewed = :lastViewed";
      expressionValues[":lastViewed"] = mapped.lastViewed;
    }
    if (mapped.labelPrintedAt) {
      updateExpression += ", labelPrintedAt = :labelPrintedAt";
      expressionValues[":labelPrintedAt"] = mapped.labelPrintedAt;
    }
    if (mapped.daysOnShelf != null) {
      updateExpression += ", daysOnShelf = :daysOnShelf";
      expressionValues[":daysOnShelf"] = mapped.daysOnShelf;
    }
    if (mapped.deleted) {
      updateExpression += ", deleted = :deleted";
      expressionValues[":deleted"] = mapped.deleted;
    }

    // GSI2 keys (account)
    if (accountId) {
      updateExpression += ", GSI2PK = :gsi2pk, GSI2SK = :gsi2sk";
      expressionValues[":gsi2pk"] = `ACCOUNT#${accountId}`;
      expressionValues[":gsi2sk"] = `ITEM#${mapped.createdAt || now}`;
    }

    // GSI3 keys (category)
    if (categoryId) {
      updateExpression += ", GSI3PK = :gsi3pk, GSI3SK = :gsi3sk";
      expressionValues[":gsi3pk"] = `CATEGORY#${categoryId}`;
      expressionValues[":gsi3sk"] = `ITEM#${mapped.createdAt || now}`;
    }

    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: existing.PK, SK: existing.SK },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionNames,
        ExpressionAttributeValues: expressionValues,
      }),
    );
    return { action: "updated" };
  }

  // Resolve owning account
  const accountSourceId = extractAccountSourceId(raw);
  let accountId = "";
  if (accountSourceId) {
    const accountRecord = await findBySourceId(accountSourceId);
    if (accountRecord) {
      accountId = accountRecord.PK.replace("ACCOUNT#", "");
    } else {
      // Account not yet synced — skip item gracefully (will be retried)
      console.warn(
        JSON.stringify({
          level: "WARN",
          message: "Account not found, skipping item",
          itemSourceId: mapped.sourceId,
          accountSourceId,
        }),
      );
      return { action: "skipped" };
    }
  }
  // When no account source ID is present, proceed without accountId

  // Resolve or create Employee (createdBy)
  let createdBy = "";
  const rawCreatedBy = raw.created_by;
  if (
    rawCreatedBy != null &&
    typeof rawCreatedBy === "object" &&
    !Array.isArray(rawCreatedBy)
  ) {
    const employee = rawCreatedBy as Record<string, unknown>;
    const employeeSourceId = typeof employee.id === "string" ? employee.id : "";
    const employeeName =
      typeof employee.name === "string" ? employee.name : "Unknown";
    if (employeeSourceId) {
      createdBy = await resolveOrCreateEmployee(employeeSourceId, employeeName);
    }
  }

  // Resolve or create Category
  let categoryId = "";
  const rawCategory = raw.category;
  if (
    rawCategory != null &&
    typeof rawCategory === "object" &&
    !Array.isArray(rawCategory)
  ) {
    const category = rawCategory as Record<string, unknown>;
    const categorySourceId = typeof category.id === "string" ? category.id : "";
    const categoryName =
      typeof category.name === "string" ? category.name : "Unknown";
    if (categorySourceId) {
      categoryId = await resolveOrCreateCategory(
        categorySourceId,
        categoryName,
      );
    }
  }

  // Create new item
  const uuid = randomUUID();
  const now = new Date().toISOString();

  // SKU resolution: use CC SKU if numeric and positive, else generate from sequence
  const rawSku = typeof raw.sku === "string" ? raw.sku : "";
  const parsedSku = rawSku ? parseInt(rawSku, 10) : NaN;
  let sku: number;
  if (!isNaN(parsedSku) && parsedSku > 0) {
    sku = parsedSku;
    // Seed the sequence counter to stay in sync
    await seedSequenceCounter("ITEM", sku);
  } else {
    sku = await getNextSequenceNumber("ITEM");
  }

  try {
    await docClient.send(
      new PutCommand({
        TableName: TABLE_NAME,
        Item: {
          PK: `ITEM#${uuid}`,
          SK: "METADATA",
          uuid,
          sku,
          GSI1PK: "ITEMS",
          GSI1SK: `ITEM#${String(sku).padStart(7, "0")}`,
          accountId,
          createdBy,
          categoryId,
          title: mapped.title,
          tagPrice: mapped.tagPrice,
          quantity: mapped.quantity,
          split: mapped.split,
          inventoryType: mapped.inventoryType,
          terms: mapped.terms,
          taxExempt: mapped.taxExempt,
          description: mapped.description,
          brand: mapped.brand,
          color: mapped.color,
          size: mapped.size,
          shelf: mapped.shelf,
          tags: mapped.tags,
          imageKeys: mapped.imageKeys,
          status: mapped.status,
          ...(accountId && {
            GSI2PK: `ACCOUNT#${accountId}`,
            GSI2SK: `ITEM#${mapped.createdAt || now}`,
          }),
          ...(categoryId && {
            GSI3PK: `CATEGORY#${categoryId}`,
            GSI3SK: `ITEM#${mapped.createdAt || now}`,
          }),
          ...(mapped.location && { location: mapped.location }),
          ...(mapped.details && { details: mapped.details }),
          ...(mapped.scheduleStart && { scheduleStart: mapped.scheduleStart }),
          ...(mapped.expirationDate && {
            expirationDate: mapped.expirationDate,
          }),
          ...(mapped.lastSold && { lastSold: mapped.lastSold }),
          ...(mapped.lastViewed && { lastViewed: mapped.lastViewed }),
          ...(mapped.labelPrintedAt && {
            labelPrintedAt: mapped.labelPrintedAt,
          }),
          ...(mapped.daysOnShelf != null && {
            daysOnShelf: mapped.daysOnShelf,
          }),
          ...(mapped.deleted && { deleted: mapped.deleted }),
          ...(rawSku && { sourceSku: rawSku }),
          sourceId: mapped.sourceId,
          createdAt: mapped.createdAt || now,
          updatedAt: now,
        },
        ConditionExpression: "attribute_not_exists(PK)",
      }),
    );
    return { action: "created" };
  } catch (error: unknown) {
    if (isConditionalCheckFailed(error)) {
      return { action: "skipped" };
    }
    throw error;
  }
}

export async function upsertSale(
  mapped: MappedSale,
  lineItems: MappedLineItem[],
  raw: Record<string, unknown>,
): Promise<UpsertResult> {
  const existing = await findBySourceId(mapped.sourceId);

  if (existing) {
    const now = new Date().toISOString();

    // Resolve cashier for update
    let updatedCashierId = "";
    let updatedCashierName: string | null = null;
    const rawCashier = raw.cashier;
    if (
      rawCashier != null &&
      typeof rawCashier === "object" &&
      !Array.isArray(rawCashier)
    ) {
      const cashier = rawCashier as Record<string, unknown>;
      const cashierSourceId = typeof cashier.id === "string" ? cashier.id : "";
      updatedCashierName =
        typeof cashier.name === "string" ? cashier.name : null;
      if (cashierSourceId) {
        updatedCashierId = await resolveOrCreateEmployee(
          cashierSourceId,
          updatedCashierName ?? "Unknown",
        );
      }
    }

    // Resolve line item Item UUIDs
    const resolvedItemIds: string[] = [];
    for (const lineItem of lineItems) {
      if (lineItem.itemSourceId) {
        const itemRecord = await findBySourceId(lineItem.itemSourceId);
        resolvedItemIds.push(
          itemRecord ? itemRecord.PK.replace("ITEM#", "") : "",
        );
      } else {
        resolvedItemIds.push("");
      }
    }

    // Update sale record
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: existing.PK, SK: existing.SK },
        UpdateExpression:
          "SET #status = :status, #subtotal = :subtotal, #total = :total, " +
          "#storePortion = :storePortion, #cogs = :cogs, #change = :change, " +
          "#memo = :memo, #refundedAmount = :refundedAmount, " +
          "#cashRoundingAdjustment = :cashRoundingAdjustment, " +
          "#lineItemCount = :lineItemCount, #finalizedAt = :finalizedAt, " +
          "#voidedAt = :voidedAt, #parkedAt = :parkedAt, " +
          "#cashierId = :cashierId, #cashierName = :cashierName, " +
          "#updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#status": "status",
          "#subtotal": "subtotal",
          "#total": "total",
          "#storePortion": "storePortion",
          "#cogs": "cogs",
          "#change": "change",
          "#memo": "memo",
          "#refundedAmount": "refundedAmount",
          "#cashRoundingAdjustment": "cashRoundingAdjustment",
          "#lineItemCount": "lineItemCount",
          "#finalizedAt": "finalizedAt",
          "#voidedAt": "voidedAt",
          "#parkedAt": "parkedAt",
          "#cashierId": "cashierId",
          "#cashierName": "cashierName",
          "#updatedAt": "updatedAt",
        },
        ExpressionAttributeValues: {
          ":status": mapped.status,
          ":subtotal": mapped.subtotal,
          ":total": mapped.total,
          ":storePortion": mapped.storePortion,
          ":cogs": mapped.cogs,
          ":change": mapped.change,
          ":memo": mapped.memo,
          ":refundedAmount": mapped.refundedAmount,
          ":cashRoundingAdjustment": mapped.cashRoundingAdjustment,
          ":lineItemCount": mapped.lineItemCount,
          ":finalizedAt": mapped.finalizedAt,
          ":voidedAt": mapped.voidedAt,
          ":parkedAt": mapped.parkedAt,
          ":cashierId": updatedCashierId || null,
          ":cashierName": updatedCashierName,
          ":updatedAt": now,
        },
      }),
    );

    // Overwrite line items
    for (let i = 0; i < lineItems.length; i++) {
      const lineItem = lineItems[i];
      const itemId = resolvedItemIds[i] || null;

      await docClient.send(
        new PutCommand({
          TableName: TABLE_NAME,
          Item: {
            PK: existing.PK,
            SK: `LINE_ITEM#${String(i).padStart(4, "0")}`,
            sourceId: lineItem.sourceId,
            itemId,
            itemSku: lineItem.itemSku,
            itemTitle: lineItem.itemTitle,
            salePrice: lineItem.salePrice,
            consignorPortion: lineItem.consignorPortion,
            storePortion: lineItem.storePortion,
            split: lineItem.split,
            quantity: lineItem.quantity,
            daysOnShelf: lineItem.daysOnShelf,
            taxedPrice: lineItem.taxedPrice,
            taxExempt: lineItem.taxExempt,
            refundedQuantity: lineItem.refundedQuantity,
            totalTax: lineItem.totalTax,
            discount: lineItem.discount,
            createdAt: lineItem.createdAt,
          },
        }),
      );
    }

    return { action: "updated" };
  }

  // Resolve cashier Employee
  let cashierId = "";
  let cashierName: string | null = null;
  const rawCashier = raw.cashier;
  if (
    rawCashier != null &&
    typeof rawCashier === "object" &&
    !Array.isArray(rawCashier)
  ) {
    const cashier = rawCashier as Record<string, unknown>;
    const cashierSourceId = typeof cashier.id === "string" ? cashier.id : "";
    cashierName = typeof cashier.name === "string" ? cashier.name : null;
    if (cashierSourceId) {
      cashierId = await resolveOrCreateEmployee(
        cashierSourceId,
        cashierName ?? "Unknown",
      );
    }
  }

  // Resolve line item Item UUIDs using itemSourceId from mapped line items
  const resolvedItemIds: string[] = [];
  for (const lineItem of lineItems) {
    if (lineItem.itemSourceId) {
      const itemRecord = await findBySourceId(lineItem.itemSourceId);
      resolvedItemIds.push(
        itemRecord ? itemRecord.PK.replace("ITEM#", "") : "",
      );
    } else {
      resolvedItemIds.push("");
    }
  }

  // Create new sale — use CC number directly, seed sequence counter
  const uuid = randomUUID();
  const saleNumber = mapped.number;
  const now = new Date().toISOString();

  // Seed sequence counter to stay in sync with imported sale numbers
  await seedSequenceCounter("SALE", saleNumber);

  const transactItems: Array<{
    Put: {
      TableName: string;
      Item: Record<string, unknown>;
      ConditionExpression?: string;
    };
  }> = [];

  // Sale record
  transactItems.push({
    Put: {
      TableName: TABLE_NAME,
      Item: {
        PK: `SALE#${uuid}`,
        SK: "METADATA",
        uuid,
        number: saleNumber,
        GSI1PK: "SALES",
        GSI1SK: `SALE#${String(saleNumber).padStart(7, "0")}`,
        status: mapped.status,
        subtotal: mapped.subtotal,
        total: mapped.total,
        storePortion: mapped.storePortion,
        cogs: mapped.cogs,
        change: mapped.change,
        memo: mapped.memo,
        refundedAmount: mapped.refundedAmount,
        cashRoundingAdjustment: mapped.cashRoundingAdjustment,
        lineItemCount: mapped.lineItemCount,
        finalizedAt: mapped.finalizedAt,
        voidedAt: mapped.voidedAt,
        parkedAt: mapped.parkedAt,
        cashierId,
        cashierName,
        sourceId: mapped.sourceId,
        createdAt: mapped.createdAt || now,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    },
  });

  // Line item records
  for (let i = 0; i < lineItems.length; i++) {
    const lineItem = lineItems[i];
    const itemId = resolvedItemIds[i] || null;

    transactItems.push({
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: `SALE#${uuid}`,
          SK: `LINE_ITEM#${String(i).padStart(4, "0")}`,
          sourceId: lineItem.sourceId,
          itemId,
          itemSku: lineItem.itemSku,
          itemTitle: lineItem.itemTitle,
          salePrice: lineItem.salePrice,
          consignorPortion: lineItem.consignorPortion,
          storePortion: lineItem.storePortion,
          split: lineItem.split,
          quantity: lineItem.quantity,
          daysOnShelf: lineItem.daysOnShelf,
          taxedPrice: lineItem.taxedPrice,
          taxExempt: lineItem.taxExempt,
          refundedQuantity: lineItem.refundedQuantity,
          totalTax: lineItem.totalTax,
          discount: lineItem.discount,
          createdAt: lineItem.createdAt,
        },
      },
    });
  }

  try {
    await docClient.send(
      new TransactWriteCommand({
        TransactItems: transactItems,
      }),
    );
    return { action: "created" };
  } catch (error: unknown) {
    if (isTransactionCanceledException(error)) {
      // TransactionCanceledException includes ConditionalCheckFailedException
      // on individual items — treat as success (sale already exists)
      return { action: "skipped" };
    }
    throw error;
  }
}
