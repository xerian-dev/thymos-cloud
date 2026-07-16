import type { DynamoDBStreamEvent } from "aws-lambda";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import {
  parseEntityType,
  routeRecord,
  ValidationError,
} from "./stream/entity-router";
import { markSynced } from "./stream/timestamp-marker";

export interface StreamHandlerResult {
  batchItemFailures: Array<{ itemIdentifier: string }>;
}

export async function handler(
  event: DynamoDBStreamEvent,
): Promise<StreamHandlerResult> {
  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records) {
    const eventID = record.eventID;
    if (!eventID) continue;

    try {
      const newImage = record.dynamodb?.NewImage;
      if (!newImage) continue;

      const item = unmarshall(
        newImage as Record<string, AttributeValue>,
      );

      // Skip if already synced
      if (item.syncedAt) continue;

      const pk = typeof item.PK === "string" ? item.PK : "";
      const sk = typeof item.SK === "string" ? item.SK : "";
      if (!pk) continue;

      const entityType = parseEntityType(pk);
      if (!entityType) {
        console.warn(
          `[stream-handler] Unrecognised PK pattern: ${pk}`,
        );
        continue;
      }

      await routeRecord({ entityType, rawAttributes: item });

      await markSynced(pk, sk);
    } catch (error: unknown) {
      if (error instanceof ValidationError) {
        console.error(
          `[stream-handler] Validation error for event ${eventID}: ${error.message}`,
        );
      } else {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[stream-handler] Transient error for event ${eventID}: ${message}`,
        );
        batchItemFailures.push({ itemIdentifier: eventID });
      }
    }
  }

  return { batchItemFailures };
}
