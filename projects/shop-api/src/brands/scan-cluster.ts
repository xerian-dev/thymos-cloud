/**
 * Scan & Cluster: extracts all distinct brand values from items in the shop
 * table, clusters them using Levenshtein distance, and saves the draft
 * mapping to S3.
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

const DRAFT_KEY = "brand-mappings/draft.json";

// --- Types ---

interface BrandEntry {
  brand: string;
  count: number;
}

interface BrandMapping {
  raw: string;
  canonical: string;
}

// --- Levenshtein distance ---

function levenshteinDistance(a: string, b: string): number {
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
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + cost,
      );
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

function pickCanonicalForm(variants: BrandEntry[]): string {
  function formScore(name: string): number {
    if (name.length === 0) return 0;
    const startsUpper = /^[A-Z]/.test(name);
    const isAllCaps = name === name.toUpperCase() && /[A-Z]/.test(name);
    const isAllLower = name === name.toLowerCase();

    if (startsUpper && !isAllCaps) return 3;
    if (startsUpper && isAllCaps && name.length <= 4) return 2;
    if (isAllCaps) return 1;
    if (isAllLower) return 0;
    return 2;
  }

  const sorted = [...variants].sort((a, b) => {
    const scoreDiff = formScore(b.brand) - formScore(a.brand);
    if (scoreDiff !== 0) return scoreDiff;
    return b.count - a.count;
  });

  return sorted[0].brand;
}

function consolidateCaseVariants(brands: BrandEntry[]): BrandEntry[] {
  const groups = new Map<string, BrandEntry[]>();

  for (const entry of brands) {
    const key = entry.brand.toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const consolidated: BrandEntry[] = [];
  for (const group of groups.values()) {
    const totalCount = group.reduce((sum, e) => sum + e.count, 0);
    const bestForm = pickCanonicalForm(group);
    consolidated.push({ brand: bestForm, count: totalCount });
  }

  return consolidated;
}

// --- Main clustering ---

function clusterBrands(brands: BrandEntry[]): BrandMapping[] {
  const consolidated = consolidateCaseVariants(brands);
  const sorted = [...consolidated].sort((a, b) => b.count - a.count);

  const mappings: BrandMapping[] = [];
  const canonicalBrands: BrandEntry[] = [];

  for (const current of sorted) {
    const currentLower = current.brand.toLowerCase();
    const currentLen = current.brand.length;
    const useExactOnly = currentLen <= 3;
    const threshold = maxAllowedDistance(currentLen);

    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const canonical of canonicalBrands) {
      if (useExactOnly) {
        if (canonical.brand.toLowerCase() === currentLower) {
          bestMatch = canonical.brand;
          bestDistance = 0;
          break;
        }
        continue;
      }

      if (Math.abs(currentLen - canonical.brand.length) > threshold) continue;

      const dist = levenshteinDistance(current.brand, canonical.brand);
      if (dist <= threshold && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = canonical.brand;
        if (dist === 0) break;
      }
    }

    if (bestMatch && bestMatch !== current.brand) {
      mappings.push({ raw: current.brand, canonical: bestMatch });
    } else {
      canonicalBrands.push(current);
    }
  }

  // Expand case variants
  const caseGroups = new Map<string, BrandEntry[]>();
  for (const entry of brands) {
    const key = entry.brand.toLowerCase();
    const group = caseGroups.get(key);
    if (group) group.push(entry);
    else caseGroups.set(key, [entry]);
  }

  const caseVariantMappings: BrandMapping[] = [];

  // Case variants of canonical brands
  for (const group of caseGroups.values()) {
    const canonical = pickCanonicalForm(group);
    for (const entry of group) {
      if (entry.brand !== canonical) {
        caseVariantMappings.push({ raw: entry.brand, canonical });
      }
    }
  }

  // Case variants of fuzzy-matched brands
  for (const mapping of mappings) {
    const variants = caseGroups.get(mapping.raw.toLowerCase());
    if (variants) {
      for (const v of variants) {
        if (v.brand !== mapping.canonical) {
          caseVariantMappings.push({
            raw: v.brand,
            canonical: mapping.canonical,
          });
        }
      }
    }
  }

  // Merge and deduplicate
  const allMappings = [...mappings, ...caseVariantMappings];
  const seen = new Set<string>();
  const deduplicated: BrandMapping[] = [];
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

  console.log("[BrandCluster] Starting scan & cluster");
  console.log(`[BrandCluster] Table: ${TABLE_NAME}, Bucket: ${BUCKET_NAME}`);

  // Step 1: Scan all items for brand values
  const brandCounts = new Map<string, number>();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let totalItems = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          "begins_with(PK, :prefix) AND SK = :sk AND attribute_exists(brand)",
        ExpressionAttributeValues: {
          ":prefix": "ITEM#",
          ":sk": "METADATA",
        },
        ProjectionExpression: "brand",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = result.Items ?? [];
    totalItems += items.length;

    for (const item of items) {
      const brand = item.brand as string | undefined;
      if (brand && brand.trim().length > 0) {
        const current = brandCounts.get(brand) ?? 0;
        brandCounts.set(brand, current + 1);
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  console.log(
    `[BrandCluster] Scanned ${totalItems} items, found ${brandCounts.size} distinct brands`,
  );

  // Step 2: Build sorted brand entries
  const brands: BrandEntry[] = Array.from(brandCounts.entries())
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count);

  // Step 3: Cluster
  const mappings = clusterBrands(brands);
  console.log(`[BrandCluster] Produced ${mappings.length} mappings`);

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
    `[BrandCluster] Complete. ${mappings.length} mappings written to s3://${BUCKET_NAME}/${DRAFT_KEY} in ${duration}ms`,
  );
}
