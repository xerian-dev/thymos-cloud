export type InventoryType = "Consignment" | "Retail";
export type Terms = "Return To Consignor" | "Donate" | "Discard";

export interface MappedItem {
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: InventoryType;
  terms: Terms;
  taxExempt: boolean;
  description?: string;
  brand?: string;
  color?: string;
  size?: string;
  shelf?: string;
  tags?: string[];
  imageKeys?: string[];
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

  // Map fields
  const mapped: MappedItem = {
    title: itemName.slice(0, 200),
    tagPrice,
    quantity,
    split,
    inventoryType: mapInventoryType(raw.inventory_type),
    terms: mapTerms(raw.terms),
    taxExempt:
      typeof raw.tax_exempt === "boolean" ? raw.tax_exempt : false,
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
          img != null && typeof img === "object" && "url" in img
      )
      .map((img) => img.url)
      .filter((url): url is string => typeof url === "string");

    if (imageKeys.length > 0) {
      mapped.imageKeys = imageKeys;
    }
  }

  return { success: true, mapped };
}
