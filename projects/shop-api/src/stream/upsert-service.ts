import { PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { TransactWriteCommand } from "@aws-sdk/lib-dynamodb";
import { randomUUID } from "node:crypto";

import { docClient, TABLE_NAME } from "./dynamodb-client";
import { findBySourceId } from "./source-id-lookup";
import { getNextSequenceNumber } from "./sequence-service";
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

export async function upsertAccount(
  mapped: MappedAccount,
): Promise<UpsertResult> {
  const existing = await findBySourceId(mapped.sourceId);

  if (existing) {
    const now = new Date().toISOString();
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: existing.PK, SK: existing.SK },
        UpdateExpression:
          "SET firstName = :firstName, lastName = :lastName, #n = :name, company = :company, " +
          "street = :street, addressLine2 = :addressLine2, place = :place, " +
          "postcode = :postcode, canton = :canton, email = :email, " +
          "telephone = :telephone, balance = :balance, defaultSplit = :defaultSplit, " +
          "defaultTerms = :defaultTerms, defaultInventoryType = :defaultInventoryType, " +
          "emailNotificationsEnabled = :emailNotificationsEnabled, " +
          "isVendor = :isVendor, taxExempt = :taxExempt, tags = :tags, " +
          "updatedAt = :updatedAt",
        ExpressionAttributeNames: {
          "#n": "name",
        },
        ExpressionAttributeValues: {
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
          ":updatedAt": now,
        },
      }),
    );
    return { action: "updated" };
  }

  // Create new account
  const uuid = randomUUID();
  // Use the ConsignCloud account number as shopUid (preserving the original numbering)
  const shopUid =
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
          shopUid: String(shopUid).padStart(7, "0"),
          GSI1PK: "ACCOUNT",
          GSI1SK: `ACCOUNT#${String(shopUid).padStart(7, "0")}`,
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
          ExpressionAttributeValues: { ":newVal": shopUid },
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
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: existing.PK, SK: existing.SK },
        UpdateExpression:
          "SET title = :title, tagPrice = :tagPrice, quantity = :quantity, " +
          "split = :split, inventoryType = :inventoryType, terms = :terms, " +
          "taxExempt = :taxExempt, updatedAt = :updatedAt" +
          (mapped.description ? ", description = :description" : "") +
          (mapped.brand ? ", brand = :brand" : "") +
          (mapped.color ? ", color = :color" : "") +
          (mapped.size ? ", size = :size" : "") +
          (mapped.shelf ? ", shelf = :shelf" : "") +
          (mapped.tags ? ", tags = :tags" : "") +
          (mapped.imageKeys ? ", imageKeys = :imageKeys" : ""),
        ExpressionAttributeValues: {
          ":title": mapped.title,
          ":tagPrice": mapped.tagPrice,
          ":quantity": mapped.quantity,
          ":split": mapped.split,
          ":inventoryType": mapped.inventoryType,
          ":terms": mapped.terms,
          ":taxExempt": mapped.taxExempt,
          ":updatedAt": now,
          ...(mapped.description && { ":description": mapped.description }),
          ...(mapped.brand && { ":brand": mapped.brand }),
          ...(mapped.color && { ":color": mapped.color }),
          ...(mapped.size && { ":size": mapped.size }),
          ...(mapped.shelf && { ":shelf": mapped.shelf }),
          ...(mapped.tags && { ":tags": mapped.tags }),
          ...(mapped.imageKeys && { ":imageKeys": mapped.imageKeys }),
        },
      }),
    );
    return { action: "updated" };
  }

  // Resolve owning account
  const accountSourceId =
    typeof raw.account_id === "string" ? raw.account_id : "";
  let accountId = "";
  if (accountSourceId) {
    const accountRecord = await findBySourceId(accountSourceId);
    if (accountRecord) {
      accountId = accountRecord.PK.replace("ACCOUNT#", "");
    } else {
      console.error(
        `[upsert-service] Account not found for sourceId: ${accountSourceId}`,
      );
    }
  }

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
  const sku = await getNextSequenceNumber("ITEM");
  const now = new Date().toISOString();

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
    // Sales are immutable — skip if already exists
    return { action: "skipped" };
  }

  // Resolve cashier Employee
  let cashierId = "";
  const rawCashier = raw.cashier;
  if (
    rawCashier != null &&
    typeof rawCashier === "object" &&
    !Array.isArray(rawCashier)
  ) {
    const cashier = rawCashier as Record<string, unknown>;
    const cashierSourceId = typeof cashier.id === "string" ? cashier.id : "";
    const cashierName =
      typeof cashier.name === "string" ? cashier.name : "Unknown";
    if (cashierSourceId) {
      cashierId = await resolveOrCreateEmployee(cashierSourceId, cashierName);
    }
  }

  // Resolve line item Item UUIDs
  const rawLineItems = Array.isArray(raw.line_items)
    ? (raw.line_items as unknown[])
    : [];

  const resolvedItemIds: string[] = [];
  for (const rawItem of rawLineItems) {
    const item = rawItem as Record<string, unknown>;
    const itemSourceId = typeof item.item_id === "string" ? item.item_id : "";
    if (itemSourceId) {
      const itemRecord = await findBySourceId(itemSourceId);
      resolvedItemIds.push(
        itemRecord ? itemRecord.PK.replace("ITEM#", "") : "",
      );
    } else {
      resolvedItemIds.push("");
    }
  }

  // Create new sale
  const uuid = randomUUID();
  const saleNumber = await getNextSequenceNumber("SALE");
  const now = new Date().toISOString();

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
        sourceNumber: mapped.sourceNumber,
        status: mapped.status,
        subtotal: mapped.subtotal,
        total: mapped.total,
        storePortion: mapped.storePortion,
        consignorPortion: mapped.consignorPortion,
        change: mapped.change,
        memo: mapped.memo,
        finalizedAt: mapped.finalizedAt,
        voidedAt: mapped.voidedAt,
        cashierId,
        sourceId: mapped.sourceId,
        createdAt: mapped.createdAt || now,
      },
      ConditionExpression: "attribute_not_exists(PK)",
    },
  });

  // Line item records
  for (let i = 0; i < lineItems.length; i++) {
    const lineItem = lineItems[i];
    const itemId = resolvedItemIds[i] ?? "";

    transactItems.push({
      Put: {
        TableName: TABLE_NAME,
        Item: {
          PK: `SALE#${uuid}`,
          SK: `LINE_ITEM#${String(i).padStart(4, "0")}`,
          itemId,
          salePrice: lineItem.salePrice,
          discount: lineItem.discount,
          consignorPortion: lineItem.consignorPortion,
          storePortion: lineItem.storePortion,
          quantity: lineItem.quantity,
          daysOnShelf: lineItem.daysOnShelf,
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
