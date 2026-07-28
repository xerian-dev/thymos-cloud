import { QueryCommand } from "@aws-sdk/lib-dynamodb";
import { docClient, TABLE_NAME } from "../dynamodb-client.js";

export interface CanonicalMappings {
  brands: Map<string, string>;
  colors: Map<string, string>;
}

export interface MapResult {
  canonical: string;
  source: string | null;
}

interface CanonicalRecord {
  name: string;
  aliases?: string[];
}

async function queryCanonicalRecords(pk: string): Promise<CanonicalRecord[]> {
  const records: CanonicalRecord[] = [];
  let exclusiveStartKey: Record<string, unknown> | undefined;

  do {
    const result = await docClient.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        KeyConditionExpression: "PK = :pk",
        ExpressionAttributeValues: { ":pk": pk },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    if (result.Items) {
      for (const item of result.Items) {
        records.push(item as unknown as CanonicalRecord);
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  return records;
}

function buildLookupMap(records: CanonicalRecord[]): Map<string, string> {
  const map = new Map<string, string>();

  for (const record of records) {
    const canonicalName = record.name;

    // Map the canonical name itself (lowercased)
    map.set(canonicalName.toLowerCase(), canonicalName);

    // Map each alias (lowercased)
    if (record.aliases) {
      for (const alias of record.aliases) {
        map.set(alias.toLowerCase(), canonicalName);
      }
    }
  }

  return map;
}

export async function loadCanonicalMappings(): Promise<CanonicalMappings> {
  const [brandRecords, colorRecords] = await Promise.all([
    queryCanonicalRecords("CANONICAL#BRANDS"),
    queryCanonicalRecords("CANONICAL#COLORS"),
  ]);

  return {
    brands: buildLookupMap(brandRecords),
    colors: buildLookupMap(colorRecords),
  };
}

export function mapBrand(
  raw: string,
  mappings: Map<string, string>,
): MapResult {
  const key = raw.toLowerCase().trim();
  const match = mappings.get(key);

  if (match) {
    return { canonical: match, source: raw };
  }

  return { canonical: raw, source: null };
}

export function mapColor(
  raw: string,
  mappings: Map<string, string>,
): MapResult {
  const key = raw.toLowerCase().trim();
  const match = mappings.get(key);

  if (match) {
    return { canonical: match, source: raw };
  }

  return { canonical: raw, source: null };
}
