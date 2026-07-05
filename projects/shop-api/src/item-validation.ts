export interface ValidatedItemInput {
  accountId: string;
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: "Consignment" | "Retail";
  terms: "Return To Consignor" | "Donate" | "Discard";
  description?: string;
  details?: string;
  tags?: string[];
  expirationDate?: string;
  imageKeys?: string[];
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  taxExempt?: boolean;
}

/**
 * Represents a normalized item ready for DynamoDB storage.
 * Empty-string optional fields are stripped, taxExempt defaults to false,
 * and empty/undefined tags are omitted.
 */
export interface NormalizedItemAttributes {
  accountId: string;
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: "Consignment" | "Retail";
  terms: "Return To Consignor" | "Donate" | "Discard";
  taxExempt: boolean;
  description?: string;
  details?: string;
  tags?: string[];
  expirationDate?: string;
  imageKeys?: string[];
  category?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
}

export interface ItemValidationError {
  field: string;
  message: string;
}

export type ItemValidationResult =
  | { valid: true; data: ValidatedItemInput }
  | { valid: false; errors: ItemValidationError[] };

const INVENTORY_TYPES = ["Consignment", "Retail"] as const;
const TERMS_VALUES = ["Return To Consignor", "Donate", "Discard"] as const;

const MAX_TAG_PRICE = 999999.99;
const MAX_QUANTITY = 9999;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_DETAILS_LENGTH = 5000;
const MAX_TAGS_COUNT = 20;
const MAX_TAG_LENGTH = 50;
const MAX_IMAGE_KEYS = 10;

/**
 * Checks whether a number has at most 2 decimal places.
 */
function hasAtMostTwoDecimals(value: number): boolean {
  const str = String(value);
  const dotIndex = str.indexOf(".");
  if (dotIndex === -1) return true;
  return str.length - dotIndex - 1 <= 2;
}

/**
 * Checks whether a string is a valid ISO 8601 date/datetime.
 */
function isValidIso8601(value: string): boolean {
  const date = new Date(value);
  return !isNaN(date.getTime());
}

/**
 * Checks whether an ISO 8601 date string represents a future date (later than current UTC).
 */
function isFutureDate(value: string): boolean {
  const date = new Date(value);
  return date.getTime() > Date.now();
}

/**
 * Validates an item creation or update request body.
 * Collects ALL validation errors rather than failing fast.
 */
export function validateItemInput(body: unknown): ItemValidationResult {
  const errors: ItemValidationError[] = [];

  if (body === null || typeof body !== "object") {
    return {
      valid: false,
      errors: [{ field: "body", message: "Request body must be an object" }],
    };
  }

  const input = body as Record<string, unknown>;

  // --- Required fields ---

  // accountId: non-empty string
  if (typeof input.accountId !== "string") {
    errors.push({ field: "accountId", message: "accountId must be a string" });
  } else if (input.accountId.length === 0) {
    errors.push({
      field: "accountId",
      message: "accountId must not be empty",
    });
  }

  // title: non-empty string, max 200
  if (typeof input.title !== "string") {
    errors.push({ field: "title", message: "title must be a string" });
  } else if (input.title.length === 0) {
    errors.push({ field: "title", message: "title must not be empty" });
  } else if (input.title.length > MAX_TITLE_LENGTH) {
    errors.push({
      field: "title",
      message: `title must be at most ${MAX_TITLE_LENGTH} characters`,
    });
  }

  // tagPrice: number, 0-999999.99, at most 2 decimal places
  if (typeof input.tagPrice !== "number" || isNaN(input.tagPrice)) {
    errors.push({ field: "tagPrice", message: "tagPrice must be a number" });
  } else if (input.tagPrice < 0) {
    errors.push({
      field: "tagPrice",
      message: "tagPrice must be at least 0",
    });
  } else if (input.tagPrice > MAX_TAG_PRICE) {
    errors.push({
      field: "tagPrice",
      message: `tagPrice must be at most ${MAX_TAG_PRICE}`,
    });
  } else if (!hasAtMostTwoDecimals(input.tagPrice)) {
    errors.push({
      field: "tagPrice",
      message: "tagPrice must have at most 2 decimal places",
    });
  }

  // quantity: positive integer, max 9999
  if (typeof input.quantity !== "number" || isNaN(input.quantity)) {
    errors.push({ field: "quantity", message: "quantity must be a number" });
  } else if (!Number.isInteger(input.quantity)) {
    errors.push({
      field: "quantity",
      message: "quantity must be an integer",
    });
  } else if (input.quantity < 1) {
    errors.push({
      field: "quantity",
      message: "quantity must be at least 1",
    });
  } else if (input.quantity > MAX_QUANTITY) {
    errors.push({
      field: "quantity",
      message: `quantity must be at most ${MAX_QUANTITY}`,
    });
  }

  // split: integer 0-100
  if (typeof input.split !== "number" || isNaN(input.split)) {
    errors.push({ field: "split", message: "split must be a number" });
  } else if (!Number.isInteger(input.split)) {
    errors.push({ field: "split", message: "split must be an integer" });
  } else if (input.split < 0) {
    errors.push({ field: "split", message: "split must be at least 0" });
  } else if (input.split > 100) {
    errors.push({ field: "split", message: "split must be at most 100" });
  }

  // inventoryType: "Consignment" | "Retail"
  if (
    typeof input.inventoryType !== "string" ||
    !(INVENTORY_TYPES as readonly string[]).includes(input.inventoryType)
  ) {
    errors.push({
      field: "inventoryType",
      message: `inventoryType must be one of: ${INVENTORY_TYPES.join(", ")}`,
    });
  }

  // terms: "Return To Consignor" | "Donate" | "Discard"
  if (
    typeof input.terms !== "string" ||
    !(TERMS_VALUES as readonly string[]).includes(input.terms)
  ) {
    errors.push({
      field: "terms",
      message: `terms must be one of: ${TERMS_VALUES.join(", ")}`,
    });
  }

  // --- Optional fields ---

  // description: max 2000 chars
  if (input.description !== undefined && input.description !== null) {
    if (typeof input.description !== "string") {
      errors.push({
        field: "description",
        message: "description must be a string",
      });
    } else if (input.description.length > MAX_DESCRIPTION_LENGTH) {
      errors.push({
        field: "description",
        message: `description must be at most ${MAX_DESCRIPTION_LENGTH} characters`,
      });
    }
  }

  // details: max 5000 chars
  if (input.details !== undefined && input.details !== null) {
    if (typeof input.details !== "string") {
      errors.push({ field: "details", message: "details must be a string" });
    } else if (input.details.length > MAX_DETAILS_LENGTH) {
      errors.push({
        field: "details",
        message: `details must be at most ${MAX_DETAILS_LENGTH} characters`,
      });
    }
  }

  // tags: array of strings, max 20 items, each max 50 chars
  if (input.tags !== undefined && input.tags !== null) {
    if (!Array.isArray(input.tags)) {
      errors.push({ field: "tags", message: "tags must be an array" });
    } else if (input.tags.length > MAX_TAGS_COUNT) {
      errors.push({
        field: "tags",
        message: `tags must have at most ${MAX_TAGS_COUNT} items`,
      });
    } else {
      const invalidTag = input.tags.find(
        (tag: unknown) =>
          typeof tag !== "string" || tag.length > MAX_TAG_LENGTH,
      );
      if (invalidTag !== undefined) {
        if (typeof invalidTag !== "string") {
          errors.push({
            field: "tags",
            message: "each tag must be a string",
          });
        } else {
          errors.push({
            field: "tags",
            message: `each tag must be at most ${MAX_TAG_LENGTH} characters`,
          });
        }
      }
    }
  }

  // expirationDate: ISO 8601, must be future
  if (input.expirationDate !== undefined && input.expirationDate !== null) {
    if (typeof input.expirationDate !== "string") {
      errors.push({
        field: "expirationDate",
        message: "expirationDate must be a string",
      });
    } else if (!isValidIso8601(input.expirationDate)) {
      errors.push({
        field: "expirationDate",
        message: "expirationDate must be a valid ISO 8601 date",
      });
    } else if (!isFutureDate(input.expirationDate)) {
      errors.push({
        field: "expirationDate",
        message: "expirationDate must be a future date",
      });
    }
  }

  // imageKeys: array, max 10 items
  if (input.imageKeys !== undefined && input.imageKeys !== null) {
    if (!Array.isArray(input.imageKeys)) {
      errors.push({
        field: "imageKeys",
        message: "imageKeys must be an array",
      });
    } else if (input.imageKeys.length > MAX_IMAGE_KEYS) {
      errors.push({
        field: "imageKeys",
        message: `imageKeys must have at most ${MAX_IMAGE_KEYS} items`,
      });
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Build validated output
  const data: ValidatedItemInput = {
    accountId: input.accountId as string,
    title: input.title as string,
    tagPrice: input.tagPrice as number,
    quantity: input.quantity as number,
    split: input.split as number,
    inventoryType: input.inventoryType as "Consignment" | "Retail",
    terms: input.terms as "Return To Consignor" | "Donate" | "Discard",
  };

  if (typeof input.description === "string" && input.description.length > 0) {
    data.description = input.description;
  }

  if (typeof input.details === "string" && input.details.length > 0) {
    data.details = input.details;
  }

  if (Array.isArray(input.tags) && input.tags.length > 0) {
    data.tags = input.tags as string[];
  }

  if (typeof input.expirationDate === "string") {
    data.expirationDate = input.expirationDate;
  }

  if (Array.isArray(input.imageKeys) && input.imageKeys.length > 0) {
    data.imageKeys = input.imageKeys as string[];
  }

  if (typeof input.category === "string") {
    data.category = input.category;
  }

  if (typeof input.brand === "string") {
    data.brand = input.brand;
  }

  if (typeof input.color === "string") {
    data.color = input.color;
  }

  if (typeof input.size === "string") {
    data.size = input.size;
  }

  if (typeof input.shelf === "string") {
    data.shelf = input.shelf;
  }

  if (typeof input.taxExempt === "boolean") {
    data.taxExempt = input.taxExempt;
  }

  return { valid: true, data };
}

/**
 * Fields that should be stripped if they are empty strings.
 */
const OPTIONAL_STRING_FIELDS = [
  "category",
  "brand",
  "color",
  "size",
  "shelf",
  "details",
  "description",
] as const;

/**
 * Normalizes validated item input into attributes ready for DynamoDB storage.
 *
 * - Strips empty-string optional fields (category, brand, color, size, shelf, details, description)
 * - Omits undefined/empty tags array
 * - Defaults taxExempt to false if omitted
 * - Preserves imageKeys array order
 */
export function normalizeItemAttributes(
  input: ValidatedItemInput,
): NormalizedItemAttributes {
  const result: NormalizedItemAttributes = {
    accountId: input.accountId,
    title: input.title,
    tagPrice: input.tagPrice,
    quantity: input.quantity,
    split: input.split,
    inventoryType: input.inventoryType,
    terms: input.terms,
    taxExempt: input.taxExempt ?? false,
  };

  // Include optional string fields only if they are non-empty strings
  for (const field of OPTIONAL_STRING_FIELDS) {
    const value = input[field];
    if (typeof value === "string" && value.length > 0) {
      result[field] = value;
    }
  }

  // Include tags only if defined and non-empty
  if (input.tags !== undefined && input.tags.length > 0) {
    result.tags = input.tags;
  }

  // Include expirationDate if present
  if (input.expirationDate !== undefined) {
    result.expirationDate = input.expirationDate;
  }

  // Preserve imageKeys array order
  if (input.imageKeys !== undefined && input.imageKeys.length > 0) {
    result.imageKeys = [...input.imageKeys];
  }

  return result;
}
