export type InventoryType = "Consignment" | "Retail";
export type Terms = "Return To Consignor" | "Donate" | "Discard";

export type ItemStatus =
  | "active"
  | "parked"
  | "inactive"
  | "expired"
  | "to_be_returned"
  | "sold"
  | "returned_to_owner"
  | "donated"
  | "lost"
  | "stolen"
  | "damaged";

export const STATUS_PRIORITY: ItemStatus[] = [
  "active",
  "parked",
  "inactive",
  "expired",
  "to_be_returned",
  "sold",
  "returned_to_owner",
  "donated",
  "lost",
  "stolen",
  "damaged",
];

export const SOLD_VARIANTS = new Set([
  "sold",
  "sold_on_shopify",
  "sold_on_square",
  "sold_on_third_party",
]);

export function deriveItemStatus(
  statusObj: Record<string, number> | null | undefined,
): ItemStatus {
  if (!statusObj || Object.keys(statusObj).length === 0) {
    return "active";
  }

  // Normalize: collapse sold variants into "sold"
  const normalized = new Map<ItemStatus, number>();
  for (const [key, count] of Object.entries(statusObj)) {
    if (count <= 0) continue;
    const normalizedKey: ItemStatus = SOLD_VARIANTS.has(key)
      ? "sold"
      : (key as ItemStatus);
    normalized.set(normalizedKey, (normalized.get(normalizedKey) ?? 0) + count);
  }

  // Return highest priority status with non-zero count
  for (const status of STATUS_PRIORITY) {
    if ((normalized.get(status) ?? 0) > 0) {
      return status;
    }
  }

  return "active";
}

export interface MappedItem {
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: InventoryType;
  terms: Terms;
  taxExempt: boolean;
  status: ItemStatus;
  description?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  location?: string;
  details?: string;
  tags?: string[];
  imageKeys?: string[];
  scheduleStart?: string;
  expirationDate?: string;
  lastSold?: string;
  lastViewed?: string;
  labelPrintedAt?: string;
  daysOnShelf?: number;
  deleted?: string;
  sourceId: string;
  createdAt: string;
}

export type ItemMappingResult =
  | { success: true; mapped: MappedItem }
  | { success: false; error: string };

function mapInventoryType(value: unknown): InventoryType {
  switch (value) {
    case "consignment":
      return "Consignment";
    case "buy_outright":
    case "retail":
      return "Retail";
    default:
      return "Consignment";
  }
}

function mapTerms(value: unknown): Terms {
  switch (value) {
    case "return_to_consignor":
      return "Return To Consignor";
    case "donate":
      return "Donate";
    case "discard":
      return "Discard";
    default:
      return "Donate";
  }
}

export function mapItem(raw: Record<string, unknown>): ItemMappingResult {
  // Extract title and sku with type guards
  const title = typeof raw.title === "string" ? raw.title : "";
  const sku = typeof raw.sku === "string" ? raw.sku : "";

  // Validate required fields — use fallback title if missing
  const itemName = title || (sku ? `Untitled (${sku})` : null);
  if (!itemName) {
    return { success: false, error: "Missing required fields: title and sku" };
  }

  // tag_price is in cents — convert to CHF (divide by 100)
  const rawTagPrice =
    typeof raw.tag_price === "number" ? raw.tag_price : undefined;
  const rawPrice = typeof raw.price === "number" ? raw.price : undefined;
  const priceInCents = rawTagPrice ?? rawPrice;

  if (priceInCents == null || priceInCents < 0) {
    return {
      success: false,
      error: `Invalid or missing required field: tagPrice (tag_price=${rawTagPrice}, price=${rawPrice})`,
    };
  }

  const tagPrice = priceInCents / 100;
  if (tagPrice > 999_999.99) {
    return {
      success: false,
      error:
        "Invalid or missing required field: tagPrice (must be 0–999,999.99)",
    };
  }

  // quantity: allow 0 (sold items)
  const quantity = typeof raw.quantity === "number" ? raw.quantity : 0;

  // split is a decimal fraction (0.0–1.0) — convert to percentage (0–100)
  const rawSplit = typeof raw.split === "number" ? raw.split : undefined;
  const rawConsignorSplit =
    typeof raw.consignor_split === "number" ? raw.consignor_split : undefined;
  const splitDecimal = rawSplit ?? rawConsignorSplit;
  const split = splitDecimal != null ? Math.round(splitDecimal * 100) : 0;

  if (split < 0 || split > 100) {
    return {
      success: false,
      error: "Invalid or missing required field: split (must be 0–100)",
    };
  }

  // Required identifiers
  const sourceId = typeof raw.id === "string" ? raw.id : "";
  const createdAt = typeof raw.created === "string" ? raw.created : "";

  // Derive status from raw.status (expected: Record<string, number>)
  const rawStatus = raw.status;
  let statusObj: Record<string, number> | null = null;
  if (
    rawStatus != null &&
    typeof rawStatus === "object" &&
    !Array.isArray(rawStatus)
  ) {
    statusObj = rawStatus as Record<string, number>;
  }

  // Map fields
  const mapped: MappedItem = {
    title: itemName.slice(0, 200),
    tagPrice,
    quantity,
    split,
    inventoryType: mapInventoryType(raw.inventory_type),
    terms: mapTerms(raw.terms),
    taxExempt: typeof raw.tax_exempt === "boolean" ? raw.tax_exempt : false,
    status: deriveItemStatus(statusObj),
    sourceId,
    createdAt,
  };

  // Optional fields — only include if present
  if (Array.isArray(raw.tags) && raw.tags.length > 0) {
    const stringTags = (raw.tags as unknown[])
      .filter((t): t is string => typeof t === "string")
      .slice(0, 20);
    if (stringTags.length > 0) {
      mapped.tags = stringTags;
    }
  }

  if (typeof raw.description === "string" && raw.description) {
    mapped.description = raw.description.slice(0, 2000);
  }

  if (typeof raw.brand === "string" && raw.brand) {
    mapped.brand = raw.brand;
  }

  if (typeof raw.color === "string" && raw.color) {
    mapped.color = raw.color;
  }

  if (typeof raw.size === "string" && raw.size) {
    mapped.size = raw.size;
  }

  // shelf/location — nested objects with a `name` field
  const shelf = raw.shelf;
  const location = raw.location;
  let shelfName: string | undefined;

  if (
    shelf != null &&
    typeof shelf === "object" &&
    "name" in shelf &&
    typeof (shelf as Record<string, unknown>).name === "string"
  ) {
    shelfName = (shelf as Record<string, unknown>).name as string;
  } else if (
    location != null &&
    typeof location === "object" &&
    "name" in location &&
    typeof (location as Record<string, unknown>).name === "string"
  ) {
    shelfName = (location as Record<string, unknown>).name as string;
  }

  if (shelfName) {
    mapped.shelf = shelfName;
  }

  // images — array of objects with a `url` field
  if (Array.isArray(raw.images) && raw.images.length > 0) {
    const imageKeys = (raw.images as unknown[])
      .filter(
        (img): img is Record<string, unknown> =>
          img != null && typeof img === "object" && "url" in img,
      )
      .map((img) => img.url)
      .filter((url): url is string => typeof url === "string");

    if (imageKeys.length > 0) {
      mapped.imageKeys = imageKeys;
    }
  }

  // location — extract from raw.location.name
  if (
    location != null &&
    typeof location === "object" &&
    "name" in location &&
    typeof (location as Record<string, unknown>).name === "string"
  ) {
    mapped.location = (location as Record<string, unknown>).name as string;
  }

  // details — string, max 5000 chars
  if (typeof raw.details === "string" && raw.details) {
    mapped.details = raw.details.slice(0, 5000);
  }

  // scheduleStart — from raw.schedule_start
  if (typeof raw.schedule_start === "string" && raw.schedule_start) {
    mapped.scheduleStart = raw.schedule_start;
  }

  // expirationDate — from raw.expires
  if (typeof raw.expires === "string" && raw.expires) {
    mapped.expirationDate = raw.expires;
  }

  // lastSold — from raw.last_sold
  if (typeof raw.last_sold === "string" && raw.last_sold) {
    mapped.lastSold = raw.last_sold;
  }

  // lastViewed — from raw.last_viewed
  if (typeof raw.last_viewed === "string" && raw.last_viewed) {
    mapped.lastViewed = raw.last_viewed;
  }

  // labelPrintedAt — from raw.printed
  if (typeof raw.printed === "string" && raw.printed) {
    mapped.labelPrintedAt = raw.printed;
  }

  // daysOnShelf — from raw.days_on_shelf (number)
  if (typeof raw.days_on_shelf === "number") {
    mapped.daysOnShelf = raw.days_on_shelf;
  }

  // deleted — from raw.deleted
  if (typeof raw.deleted === "string" && raw.deleted) {
    mapped.deleted = raw.deleted;
  }

  return { success: true, mapped };
}
