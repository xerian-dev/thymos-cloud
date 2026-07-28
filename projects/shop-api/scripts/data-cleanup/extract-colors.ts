#!/usr/bin/env npx tsx
// Usage: npx tsx scripts/data-cleanup/extract-colors.ts [--table thymos-dev-shop]
//
// Extracts all distinct `color` values from consignment items in the shop table,
// maps them to canonical English colour names using a predefined mapping, and writes
// the results to scripts/data-cleanup/output/colors-mapping.json for human review.

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand } from "@aws-sdk/lib-dynamodb";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- Types ---

interface ColorMapping {
  raw: string;
  canonical: string | null;
  count: number;
}

// --- Canonical Colour Mapping ---
// All keys are lowercase for case-insensitive lookup.

const CANONICAL_COLOR_MAP: Record<string, string> = {
  // German → English
  rot: "Red",
  blau: "Blue",
  grün: "Green",
  gruen: "Green",
  gelb: "Yellow",
  schwarz: "Black",
  weiss: "White",
  weiß: "White",
  braun: "Brown",
  grau: "Grey",
  rosa: "Pink",
  lila: "Purple",
  orange: "Orange",

  // English canonical (self-mapping for consistency)
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  black: "Black",
  white: "White",
  brown: "Brown",
  pink: "Pink",
  purple: "Purple",

  // English variants
  grey: "Grey",
  gray: "Grey",
  beige: "Beige",
  navy: "Navy",
  maroon: "Maroon",
  turquoise: "Turquoise",
  teal: "Teal",
  burgundy: "Burgundy",
  cream: "Cream",
  ivory: "Ivory",
  coral: "Coral",
  khaki: "Khaki",
  tan: "Tan",
  olive: "Olive",
};

// --- CLI Argument Parsing ---

function parseArgs(argv: string[]): { table: string } {
  const args = { table: process.env.TABLE_NAME || "thymos-dev-shop" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--table" && argv[i + 1]) {
      args.table = argv[++i];
    }
  }
  return args;
}

// --- Helpers ---

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function lookupCanonical(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();
  return CANONICAL_COLOR_MAP[normalized] ?? null;
}

// --- Main ---

async function main(): Promise<void> {
  const { table } = parseArgs(process.argv);

  console.log(`Extracting colour values from table: ${table}`);
  console.log(`Region: eu-central-1`);
  console.log("---");

  const client = new DynamoDBClient({ region: "eu-central-1" });
  const docClient = DynamoDBDocumentClient.from(client);

  const colorCounts = new Map<string, number>();
  let exclusiveStartKey: Record<string, unknown> | undefined = undefined;
  let pageCount = 0;
  let totalItems = 0;

  do {
    pageCount++;
    const scanResult = await docClient.send(
      new ScanCommand({
        TableName: table,
        FilterExpression:
          "inventoryType = :invType AND attribute_exists(color) AND color <> :empty",
        ExpressionAttributeValues: {
          ":invType": "Consignment",
          ":empty": "",
        },
        ProjectionExpression: "color",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = scanResult.Items ?? [];
    totalItems += items.length;
    exclusiveStartKey = scanResult.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;

    for (const item of items) {
      const color = item.color as string;
      colorCounts.set(color, (colorCounts.get(color) ?? 0) + 1);
    }

    console.log(
      `  Page ${pageCount}: ${items.length} items with color${exclusiveStartKey ? " (more pages)" : " (last page)"}`,
    );

    if (exclusiveStartKey) {
      await sleep(200);
    }
  } while (exclusiveStartKey);

  console.log(`\nTotal items with color: ${totalItems}`);
  console.log(`Distinct color values: ${colorCounts.size}`);

  // Build mapping output
  const mappings: ColorMapping[] = [];
  for (const [raw, count] of colorCounts) {
    mappings.push({
      raw,
      canonical: lookupCanonical(raw),
      count,
    });
  }

  // Sort by count descending
  mappings.sort((a, b) => b.count - a.count);

  // Summary stats
  const mapped = mappings.filter((m) => m.canonical !== null).length;
  const unmapped = mappings.filter((m) => m.canonical === null).length;
  console.log(`\nMapped to canonical: ${mapped}`);
  console.log(`Needs human review (no mapping): ${unmapped}`);

  // Write output
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const outputDir = resolve(__dirname, "output");
  mkdirSync(outputDir, { recursive: true });

  const outputPath = resolve(outputDir, "colors-mapping.json");
  writeFileSync(outputPath, JSON.stringify(mappings, null, 2), "utf-8");

  console.log(`\nOutput written to: ${outputPath}`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
