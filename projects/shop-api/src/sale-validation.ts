export interface ValidatedSaleInput {
  status: "open" | "finalized" | "voided";
  cashierId: string;
  subtotal?: number;
  total?: number;
  storePortion?: number;
  consignorPortion?: number;
  change?: number;
  memo?: string;
}

export interface SaleValidationError {
  field: string;
  message: string;
}

export type SaleValidationResult =
  | { valid: true; data: ValidatedSaleInput }
  | { valid: false; errors: SaleValidationError[] };

export const ALLOWED_SALE_STATUSES = ["open", "finalized", "voided"] as const;

/**
 * Validates a sale creation request body.
 * Collects ALL validation errors rather than failing fast.
 */
export function validateSaleInput(body: unknown): SaleValidationResult {
  const errors: SaleValidationError[] = [];

  if (body === null || typeof body !== "object") {
    return {
      valid: false,
      errors: [{ field: "body", message: "Request body must be an object" }],
    };
  }

  const input = body as Record<string, unknown>;

  // --- Required fields ---

  // status: must be one of "open", "finalized", "voided"
  if (
    typeof input.status !== "string" ||
    !(ALLOWED_SALE_STATUSES as readonly string[]).includes(input.status)
  ) {
    errors.push({
      field: "status",
      message: `status must be one of: ${ALLOWED_SALE_STATUSES.join(", ")}`,
    });
  }

  // cashierId: non-empty string
  if (typeof input.cashierId !== "string") {
    errors.push({ field: "cashierId", message: "cashierId must be a string" });
  } else if (input.cashierId.length === 0) {
    errors.push({
      field: "cashierId",
      message: "cashierId must not be empty",
    });
  }

  // --- Optional numeric fields ---

  if (input.subtotal !== undefined && input.subtotal !== null) {
    if (typeof input.subtotal !== "number" || isNaN(input.subtotal as number)) {
      errors.push({ field: "subtotal", message: "subtotal must be a number" });
    }
  }

  if (input.total !== undefined && input.total !== null) {
    if (typeof input.total !== "number" || isNaN(input.total as number)) {
      errors.push({ field: "total", message: "total must be a number" });
    }
  }

  if (input.storePortion !== undefined && input.storePortion !== null) {
    if (typeof input.storePortion !== "number" || isNaN(input.storePortion as number)) {
      errors.push({ field: "storePortion", message: "storePortion must be a number" });
    }
  }

  if (input.consignorPortion !== undefined && input.consignorPortion !== null) {
    if (typeof input.consignorPortion !== "number" || isNaN(input.consignorPortion as number)) {
      errors.push({ field: "consignorPortion", message: "consignorPortion must be a number" });
    }
  }

  if (input.change !== undefined && input.change !== null) {
    if (typeof input.change !== "number" || isNaN(input.change as number)) {
      errors.push({ field: "change", message: "change must be a number" });
    }
  }

  // --- Optional string field ---

  if (input.memo !== undefined && input.memo !== null) {
    if (typeof input.memo !== "string") {
      errors.push({ field: "memo", message: "memo must be a string" });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated output
  const data: ValidatedSaleInput = {
    status: input.status as "open" | "finalized" | "voided",
    cashierId: input.cashierId as string,
  };

  if (typeof input.subtotal === "number") {
    data.subtotal = input.subtotal;
  }

  if (typeof input.total === "number") {
    data.total = input.total;
  }

  if (typeof input.storePortion === "number") {
    data.storePortion = input.storePortion;
  }

  if (typeof input.consignorPortion === "number") {
    data.consignorPortion = input.consignorPortion;
  }

  if (typeof input.change === "number") {
    data.change = input.change;
  }

  if (typeof input.memo === "string") {
    data.memo = input.memo;
  }

  return { valid: true, data };
}
