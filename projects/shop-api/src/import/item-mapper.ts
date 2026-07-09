import { ConsignCloudItem } from "./item-consigncloud-client";

export interface MappedItemFields {
  title: string;
  tagPrice: number;
  quantity: number;
  split: number;
  inventoryType: "Consignment";
  terms: "Return To Consignor";
  taxExempt: boolean;
  category?: string;
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

export function mapConsignCloudItem(item: ConsignCloudItem): ItemMappingResult {
  // Validate required fields
  if (!item.name) {
    return { success: false, error: "Missing or empty required field: title" };
  }

  if (item.price == null || item.price < 0 || item.price > 999_999.99) {
    return {
      success: false,
      error:
        "Invalid or missing required field: tagPrice (must be 0–999,999.99)",
    };
  }

  if (item.quantity == null || item.quantity < 1 || item.quantity > 9999) {
    return {
      success: false,
      error: "Invalid or missing required field: quantity (must be 1–9999)",
    };
  }

  if (
    item.consignor_split == null ||
    item.consignor_split < 0 ||
    item.consignor_split > 100
  ) {
    return {
      success: false,
      error: "Invalid or missing required field: split (must be 0–100)",
    };
  }

  // Map fields
  const mapped: MappedItemFields = {
    title: item.name.slice(0, 200),
    tagPrice: item.price,
    quantity: item.quantity,
    split: item.consignor_split,
    inventoryType: "Consignment",
    terms: "Return To Consignor",
    taxExempt: item.tax_exempt ?? false,
  };

  // Optional fields — only include if present
  if (item.category?.name) {
    mapped.category = item.category.name;
  }

  if (item.tags && item.tags.length > 0) {
    mapped.tags = item.tags.slice(0, 20);
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
