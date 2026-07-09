import { ConsignCloudItem } from "./item-consigncloud-client";

/**
 * Returns true if the item has been deleted (non-null `deleted` field).
 * Deleted items should be skipped during import processing.
 */
export function isDeletedItem(item: ConsignCloudItem): boolean {
  return item.deleted != null;
}
