#!/usr/bin/env npx tsx
// Usage: npx tsx scripts/data-cleanup/extract-brands.ts
//
// Extracts all distinct brand values from consignment items in the shop table,
// counts how many items have each brand, and writes the result to
// scripts/data-cleanup/output/brands-raw.json sorted by count descending.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const TABLE_NAME = process.env.TABLE_NAME ?? "thymos-dev-shop";
const REGION = "eu-central-1";

interface BrandCount {
  brand: string;
  count: number;
}

async function extractBrands(): Promise<void> {
  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client);

  const brandCounts = new Map<string, number>();
  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;
  let totalItems = 0;
  let pageCount = 0;

  console.log(`Scanning table: ${TABLE_NAME}`);
  console.log(`Region: ${REGION}`);
  console.log(`Filter: inventoryType = "Consignment"`);
  console.log("---");

  do {
    pageCount++;

    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression: "inventoryType = :invType",
        ExpressionAttributeValues: {
          ":invType": "Consignment",
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

    console.log(
      `  Page ${pageCount}: ${items.length} items${exclusiveStartKey ? " (more pages)" : " (last page)"}`,
    );
  } while (exclusiveStartKey);

  // Sort by count descending
  const sorted: BrandCount[] = Array.from(brandCounts.entries())
    .map(([brand, count]) => ({ brand, count }))
    .sort((a, b) => b.count - a.count);

  // Write output
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const outputDir = join(scriptDir, "output");
  await mkdir(outputDir, { recursive: true });

  const outputPath = join(outputDir, "brands-raw.json");
  await writeFile(outputPath, JSON.stringify(sorted, null, 2), "utf-8");

  // Summary
  console.log("\n---");
  console.log("Summary:");
  console.log(`  Pages scanned: ${pageCount}`);
  console.log(`  Total consignment items: ${totalItems}`);
  console.log(`  Distinct brands: ${sorted.length}`);
  console.log(`  Output: ${outputPath}`);
}

extractBrands().catch((err: unknown) => {
  console.error("Failed to extract brands:", err);
  process.exit(1);
});
