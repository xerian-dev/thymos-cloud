/**
 * Description Scan & Cluster: extracts all distinct description values from
 * items in the shop table, clusters them using Levenshtein distance (same
 * algorithm as brands), and saves the draft mapping to S3.
 *
 * Descriptions are short German item-type keywords (e.g., "hose", "sandalen").
 */

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const TABLE_NAME = process.env.TABLE_NAME ?? "";
const BUCKET_NAME = process.env.BUCKET_NAME ?? "";
const REGION = process.env.AWS_REGION ?? "eu-central-1";

const dynamoClient = new DynamoDBClient({ region: REGION });
const docClient = DynamoDBDocumentClient.from(dynamoClient);
const s3Client = new S3Client({ region: REGION });

const DRAFT_KEY = "description-mappings/draft.json";

// --- Types ---

export interface DescriptionEntry {
  raw: string;
  count: number;
}

export interface DescriptionMapping {
  raw: string;
  canonical: string;
}

// --- Levenshtein distance ---

export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  const aLen = aLower.length;
  const bLen = bLower.length;

  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  if (aLower === bLower) return 0;

  const prev: number[] = Array.from({ length: bLen + 1 }, (_, i) => i);
  const curr: number[] = new Array(bLen + 1);

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bLen; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > 2) return rowMin;
    for (let j = 0; j <= bLen; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[bLen];
}

// --- Clustering helpers ---

function maxAllowedDistance(len: number): number {
  if (len <= 3) return 0;
  if (len <= 5) return 1;
  return 2;
}

function pickCanonicalForm(variants: DescriptionEntry[]): string {
  function formScore(name: string): number {
    if (name.length === 0) return 0;
    const firstUpper = /^[A-ZÄÖÜ]/.test(name);
    const isAllCaps = name === name.toUpperCase() && /[A-ZÄÖÜ]/.test(name);
    const isAllLower = name === name.toLowerCase();

    if (firstUpper && !isAllCaps) return 3; // Title Case
    if (isAllCaps && name.length <= 4) return 2; // Short acronym
    if (isAllCaps) return 1;
    if (isAllLower) return 0;
    return 2; // mixed
  }

  const sorted = [...variants].sort((a, b) => {
    const scoreDiff = formScore(b.raw) - formScore(a.raw);
    if (scoreDiff !== 0) return scoreDiff;
    return b.count - a.count;
  });

  return sorted[0].raw;
}

function consolidateCaseVariants(
  descriptions: DescriptionEntry[],
): DescriptionEntry[] {
  const groups = new Map<string, DescriptionEntry[]>();

  for (const entry of descriptions) {
    const key = entry.raw.toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const consolidated: DescriptionEntry[] = [];
  for (const group of groups.values()) {
    const totalCount = group.reduce((sum, e) => sum + e.count, 0);
    const bestForm = pickCanonicalForm(group);
    consolidated.push({ raw: bestForm, count: totalCount });
  }

  return consolidated;
}

// --- Main clustering ---

export function clusterDescriptions(
  descriptions: DescriptionEntry[],
): DescriptionMapping[] {
  // Filter invalid entries
  const valid = descriptions.filter(
    (e) => e.raw && typeof e.raw === "string" && e.raw.trim().length > 0,
  );

  // Step 1: Consolidate case variants
  const consolidated = consolidateCaseVariants(valid);
  const sorted = [...consolidated].sort((a, b) => b.count - a.count);

  // Step 2: Canonical attraction clustering (same as brands)
  const mappings: DescriptionMapping[] = [];
  const canonicals: DescriptionEntry[] = [];

  for (const current of sorted) {
    const currentLower = current.raw.toLowerCase();
    const currentLen = current.raw.length;
    const useExactOnly = currentLen <= 3;
    const threshold = maxAllowedDistance(currentLen);

    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const canonical of canonicals) {
      if (useExactOnly) {
        if (canonical.raw.toLowerCase() === currentLower) {
          bestMatch = canonical.raw;
          bestDistance = 0;
          break;
        }
        continue;
      }

      if (Math.abs(currentLen - canonical.raw.length) > threshold) continue;

      const dist = levenshteinDistance(current.raw, canonical.raw);
      if (dist <= threshold && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = canonical.raw;
        if (dist === 0) break;
      }
    }

    if (bestMatch && bestMatch !== current.raw) {
      mappings.push({ raw: current.raw, canonical: bestMatch });
    } else {
      canonicals.push(current);
    }
  }

  // Step 3: Expand case variants
  const caseGroups = new Map<string, DescriptionEntry[]>();
  for (const entry of valid) {
    const key = entry.raw.toLowerCase();
    const group = caseGroups.get(key);
    if (group) group.push(entry);
    else caseGroups.set(key, [entry]);
  }

  const caseVariantMappings: DescriptionMapping[] = [];

  // Case variants of canonical descriptions
  for (const group of caseGroups.values()) {
    const canonical = pickCanonicalForm(group);
    for (const entry of group) {
      if (entry.raw !== canonical) {
        caseVariantMappings.push({ raw: entry.raw, canonical });
      }
    }
  }

  // Case variants of fuzzy-matched descriptions
  for (const mapping of mappings) {
    const variants = caseGroups.get(mapping.raw.toLowerCase());
    if (variants) {
      for (const v of variants) {
        if (v.raw !== mapping.canonical) {
          caseVariantMappings.push({
            raw: v.raw,
            canonical: mapping.canonical,
          });
        }
      }
    }
  }

  // Merge and deduplicate
  const allMappings = [...mappings, ...caseVariantMappings];
  const seen = new Set<string>();
  const deduplicated: DescriptionMapping[] = [];
  for (const m of allMappings) {
    if (m.raw === m.canonical) continue;
    if (seen.has(m.raw)) continue;
    seen.add(m.raw);
    deduplicated.push(m);
  }

  deduplicated.sort((a, b) => a.raw.localeCompare(b.raw));
  return deduplicated;
}

// --- Handler ---

export async function handler(): Promise<void> {
  const startTime = Date.now();

  console.log("[DescCluster] Starting scan & cluster");
  console.log(`[DescCluster] Table: ${TABLE_NAME}, Bucket: ${BUCKET_NAME}`);

  // Step 1: Scan all items for description values
  const descCounts = new Map<string, number>();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let totalItems = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          "begins_with(PK, :prefix) AND SK = :sk AND attribute_exists(description) AND description <> :empty",
        ExpressionAttributeValues: {
          ":prefix": "ITEM#",
          ":sk": "METADATA",
          ":empty": "",
        },
        ProjectionExpression: "description",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = result.Items ?? [];
    totalItems += items.length;

    for (const item of items) {
      const desc = item.description as string | undefined;
      if (desc && typeof desc === "string" && desc.trim().length > 0) {
        const current = descCounts.get(desc) ?? 0;
        descCounts.set(desc, current + 1);
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  console.log(
    `[DescCluster] Scanned ${totalItems} items with description, found ${descCounts.size} distinct values`,
  );

  // Step 2: Build sorted entries
  const descriptions: DescriptionEntry[] = Array.from(descCounts.entries())
    .map(([raw, count]) => ({ raw, count }))
    .sort((a, b) => b.count - a.count);

  // Step 3: Cluster
  const mappings = clusterDescriptions(descriptions);
  console.log(`[DescCluster] Produced ${mappings.length} mappings`);

  // Step 4: Write draft to S3
  const draftContent = JSON.stringify(mappings, null, 2);
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: DRAFT_KEY,
      Body: draftContent,
      ContentType: "application/json",
    }),
  );

  const duration = Date.now() - startTime;
  console.log(
    `[DescCluster] Complete. ${mappings.length} mappings written to s3://${BUCKET_NAME}/${DRAFT_KEY} in ${duration}ms`,
  );
}
