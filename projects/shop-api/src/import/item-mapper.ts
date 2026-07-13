import { ConsignCloudItem } from "./item-consigncloud-client";

export type InventoryType = "Consignment" | "Retail";
export type Terms = "Return To Consignor" | "Donate" | "Discard";

export interface MappedItemFields {
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: InventoryType;
  terms: Terms;
  taxExempt: boolean;
  tags?: string[];
  description?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  imageKeys?: string[];
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

  return { success: true, mapped };
}
