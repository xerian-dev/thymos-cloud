import { ConsignCloudItem } from "./item-consigncloud-client";

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

export interface MappedItemFields {
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: InventoryType;
  terms: Terms;
  taxExempt: boolean;
  status: ItemStatus;
  tags?: string[];
  description?: string;
  details?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  location?: string;
  imageKeys?: string[];
  scheduleStart?: string;
  expirationDate?: string;
  lastSold?: string;
  lastViewed?: string;
  labelPrintedAt?: string;
  daysOnShelf?: number;
  deleted?: string;
  createdAt: string;
}

export type ItemMappingResult =
  | { success: true; mapped: MappedItemFields }
  | { success: false; error: string };

function mapInventoryType(value: string | undefined): InventoryType {
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

function mapTerms(value: string | undefined): Terms {
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

export function mapConsignCloudItem(item: ConsignCloudItem): ItemMappingResult {
  // Validate required fields — use fallback title if missing
  const itemName = item.title || (item.sku ? `Untitled (${item.sku})` : null);
  if (!itemName) {
    return { success: false, error: "Missing required fields: title and sku" };
  }

  // tag_price is in cents — convert to CHF (divide by 100)
  const rawPrice = item.tag_price ?? item.price;
  if (rawPrice == null || rawPrice < 0) {
    return {
      success: false,
      error: `Invalid or missing required field: tagPrice (tag_price=${item.tag_price}, price=${item.price})`,
    };
  }
  const tagPrice = rawPrice / 100;
  if (tagPrice > 999_999.99) {
    return {
      success: false,
      error:
        "Invalid or missing required field: tagPrice (must be 0–999,999.99)",
    };
  }

  // quantity: allow 0 (sold items)
  const quantity = item.quantity ?? 0;

  // split is a decimal fraction (0.0–1.0) — convert to percentage (0–100)
  const rawSplit = item.split ?? item.consignor_split;
  const split = rawSplit != null ? Math.round(rawSplit * 100) : 0;
  if (split < 0 || split > 100) {
    return {
      success: false,
      error: "Invalid or missing required field: split (must be 0–100)",
    };
  }

  // Map fields
  const mapped: MappedItemFields = {
    title: itemName.slice(0, 200),
    tagPrice,
    quantity,
    split,
    inventoryType: mapInventoryType(item.inventory_type),
    terms: mapTerms(item.terms),
    taxExempt: item.tax_exempt ?? false,
    status: deriveItemStatus(item.status),
    createdAt: item.created,
  };

  // Optional fields — only include if present
  if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
    const stringTags = (item.tags as unknown[])
      .filter((t): t is string => typeof t === "string")
      .slice(0, 20);
    if (stringTags.length > 0) {
      mapped.tags = stringTags;
    }
  }

  if (item.description) {
    mapped.description = item.description.slice(0, 2000);
  }

  if (item.brand) {
    mapped.brand = item.brand;
  }

  if (item.color) {
    mapped.color = item.color;
  }

  if (item.size) {
    mapped.size = item.size;
  }

  const shelfName: string | undefined =
    item.shelf?.name ?? item.location?.name ?? undefined;
  if (shelfName) {
    mapped.shelf = shelfName;
  }

  if (item.images && item.images.length > 0) {
    mapped.imageKeys = item.images.map((img) => img.url);
  }

  // New optional fields
  if (item.location?.name) {
    mapped.location = item.location.name;
  }

  if (item.details) {
    mapped.details = item.details.slice(0, 5000);
  }

  if (item.schedule_start) {
    mapped.scheduleStart = item.schedule_start;
  }

  if (item.expires) {
    mapped.expirationDate = item.expires;
  }

  if (item.last_sold) {
    mapped.lastSold = item.last_sold;
  }

  if (item.last_viewed) {
    mapped.lastViewed = item.last_viewed;
  }

  if (item.printed) {
    mapped.labelPrintedAt = item.printed;
  }

  if (item.days_on_shelf != null) {
    mapped.daysOnShelf = item.days_on_shelf;
  }

  if (item.deleted) {
    mapped.deleted = item.deleted;
  }

  return { success: true, mapped };
}
