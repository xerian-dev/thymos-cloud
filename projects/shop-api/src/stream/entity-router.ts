import { mapAccount } from "./account-mapper";
import { mapItem } from "./item-mapper";
import { mapSale } from "./sale-mapper";
import { upsertAccount, upsertItem, upsertSale } from "./upsert-service";

export type EntityType = "ACCOUNT" | "ITEM" | "SALE";

const VALID_ENTITY_TYPES: ReadonlySet<string> = new Set([
  "ACCOUNT",
  "ITEM",
  "SALE",
]);

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Parses the entity type from an import record PK.
 * PK pattern: `IMPORT#CONSIGNCLOUD#<TYPE>#<id>`
 * Returns the entity type if valid, or null if unrecognised.
 */
export function parseEntityType(pk: string): EntityType | null {
  const segments = pk.split("#");
  const typeSegment = segments[2];

  if (typeSegment && VALID_ENTITY_TYPES.has(typeSegment)) {
    return typeSegment as EntityType;
  }

  return null;
}

export interface RoutableRecord {
  entityType: EntityType;
  rawAttributes: Record<string, unknown>;
}

/**
 * Routes a parsed import record to the appropriate mapper + upsert flow.
 *
 * - ACCOUNT: mapAccount → upsertAccount
 * - ITEM: mapItem → upsertItem (validation errors throw ValidationError)
 * - SALE: mapSale → upsertSale (validation errors throw ValidationError)
 *
 * Logs a warning and returns without throwing for unrecognised entity types.
 */
export async function routeRecord(record: RoutableRecord): Promise<void> {
  switch (record.entityType) {
    case "ACCOUNT": {
      const mapped = mapAccount(record.rawAttributes);
      await upsertAccount(mapped, record.rawAttributes);
      return;
    }

    case "ITEM": {
      const result = mapItem(record.rawAttributes);
      if (!result.success) {
        throw new ValidationError(result.error);
      }
      await upsertItem(result.mapped, record.rawAttributes);
      return;
    }

    case "SALE": {
      const result = mapSale(record.rawAttributes);
      if (!result.success) {
        throw new ValidationError(result.error);
      }
      await upsertSale(result.sale, result.lineItems, record.rawAttributes);
      return;
    }

    default: {
      console.warn(
        `[entity-router] Unrecognised entity type: ${String((record as { entityType: string }).entityType)}`,
      );
    }
  }
}
