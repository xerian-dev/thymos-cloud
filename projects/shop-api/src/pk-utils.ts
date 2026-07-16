const ACCOUNT_PREFIX = "ACCOUNT#";
const ITEM_PREFIX = "ITEM#";
const PAD_LENGTH = 7;

/**
 * Constructs a DynamoDB PK from a UUID.
 * Example: buildAccountUuidPk("abc-123") → "ACCOUNT#abc-123"
 */
export function buildAccountUuidPk(uuid: string): string {
  return `${ACCOUNT_PREFIX}${uuid}`;
}

/**
 * Formats an account number as a 7-digit zero-padded string.
 * Example: formatAccountNumber(42) → "0000042"
 */
export function formatAccountNumber(accountNumber: number): string {
  return String(accountNumber).padStart(PAD_LENGTH, "0");
}

/**
 * Formats an account number as the GSI1SK value with a 7-digit zero-padded number.
 * Example: formatAccountGsi1sk(42) → "ACCOUNT#0000042"
 */
export function formatAccountGsi1sk(accountNumber: number): string {
  return `${ACCOUNT_PREFIX}${String(accountNumber).padStart(PAD_LENGTH, "0")}`;
}

/**
 * Constructs a DynamoDB PK for an item from a UUID.
 * Example: buildItemPk("abc-123") → "ITEM#abc-123"
 */
export function buildItemPk(uuid: string): string {
  return `${ITEM_PREFIX}${uuid}`;
}

/**
 * Formats an item SKU as the GSI1SK value with a 7-digit zero-padded SKU.
 * Example: formatSkuGsi1sk(42) → "ITEM#0000042"
 */
export function formatSkuGsi1sk(sku: number): string {
  return `${ITEM_PREFIX}${String(sku).padStart(PAD_LENGTH, "0")}`;
}

const SALE_PREFIX = "SALE#";
const EMPLOYEE_PREFIX = "EMPLOYEE#";

/**
 * Constructs a DynamoDB PK for a sale from a UUID.
 * Example: buildSalePk("abc-123") → "SALE#abc-123"
 */
export function buildSalePk(uuid: string): string {
  return `${SALE_PREFIX}${uuid}`;
}

/**
 * Formats a sale number as the GSI1SK value with a 7-digit zero-padded number.
 * Example: formatSaleGsi1sk(42) → "SALE#0000042"
 */
export function formatSaleGsi1sk(saleNumber: number): string {
  return `${SALE_PREFIX}${String(saleNumber).padStart(PAD_LENGTH, "0")}`;
}

/**
 * Constructs a DynamoDB PK for an employee from a UUID.
 * Example: buildEmployeePk("abc-123") → "EMPLOYEE#abc-123"
 */
export function buildEmployeePk(uuid: string): string {
  return `${EMPLOYEE_PREFIX}${uuid}`;
}
