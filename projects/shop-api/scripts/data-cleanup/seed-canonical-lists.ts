#!/usr/bin/env npx tsx
// Usage: npx tsx scripts/data-cleanup/seed-canonical-lists.ts
//
// Seeds canonical brand and colour lists into DynamoDB from approved mapping files.
// Reads:
//   - scripts/data-cleanup/output/brand-clusters.json  — format: [{ "raw": string, "canonical": string }]
//   - scripts/data-cleanup/output/colors-mapping.json  — format: [{ "raw": string, "canonical": string | null, "count": number }]
//
// Writes:
//   - PK = "CANONICAL#BRANDS", SK = "BRAND#<name>" for each distinct canonical brand
//   - PK = "CANONICAL#COLORS", SK = "COLOR#<name>" for each distinct canonical colour
//
// Each record includes: name, aliases (known variants), createdAt.
// Idempotent: uses full PutItem (overwrites existing records).

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { readFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const TABLE_NAME = process.env.TABLE_NAME ?? "thymos-dev-shop";
const REGION = "eu-central-1";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface BrandMappingEntry {
  raw: string;
  canonical: string;
}

interface ColorMappingEntry {
  raw: string;
  canonical: string | null;
  count: number;
}

interface CanonicalRecord {
  name: string;
  aliases: string[];
}

function groupBrands(entries: BrandMappingEntry[]): CanonicalRecord[] {
  const groups = new Map<string, Set<string>>();

  for (const entry of entries) {
    const existing = groups.get(entry.canonical) ?? new Set<string>();
    existing.add(entry.raw);
    groups.set(entry.canonical, existing);
  }

  const records: CanonicalRecord[] = [];
  for (const [canonical, rawSet] of groups) {
    const aliases = [...rawSet].filter((raw) => raw !== canonical).sort();
    records.push({ name: canonical, aliases });
  }

  return records.sort((a, b) => a.name.localeCompare(b.name));
}

function groupColors(entries: ColorMappingEntry[]): CanonicalRecord[] {
  const groups = new Map<string, Set<string>>();

  for (const entry of entries) {
    if (!entry.canonical) {
      continue;
    }

    const existing = groups.get(entry.canonical) ?? new Set<string>();
    // Only add raw values that don't exactly equal the canonical
    if (entry.raw !== entry.canonical) {
      existing.add(entry.raw);
    }
    groups.set(entry.canonical, existing);
  }

  const records: CanonicalRecord[] = [];
  for (const [canonical, rawSet] of groups) {
    const aliases = [...rawSet].sort();
    records.push({ name: canonical, aliases });
  }

  return records.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

async function loadJsonFile<T>(filePath: string): Promise<T> {
  const absolutePath = resolve(filePath);
  const content = await readFile(absolutePath, "utf-8");
  return JSON.parse(content) as T;
}

async function seedCanonicalLists(): Promise<void> {
  const brandFilePath = resolve(__dirname, "output/brand-clusters.json");
  const colorFilePath = resolve(__dirname, "output/colors-mapping.json");

  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Region: ${REGION}`);
  console.log(`Brand file: ${brandFilePath}`);
  console.log(`Color file: ${colorFilePath}`);
  console.log("---");

  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  const createdAt = new Date().toISOString();

  // --- Seed brands ---
  let brandEntries: BrandMappingEntry[];
  try {
    brandEntries = await loadJsonFile<BrandMappingEntry[]>(brandFilePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to read brand file: ${message}`);
    console.log("Skipping brand seeding.");
    brandEntries = [];
  }

  if (brandEntries.length > 0) {
    const brandRecords = groupBrands(brandEntries);
    console.log(`Found ${brandRecords.length} canonical brands to seed`);

    let brandSuccessCount = 0;
    let brandErrorCount = 0;

    for (const record of brandRecords) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: "CANONICAL#BRANDS",
              SK: `BRAND#${record.name}`,
              name: record.name,
              aliases: record.aliases,
              createdAt,
            },
          }),
        );
        brandSuccessCount++;
      } catch (err: unknown) {
        brandErrorCount++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Error seeding brand "${record.name}": ${message}`);
      }
    }

    console.log(
      `Brands: ${brandSuccessCount} seeded, ${brandErrorCount} errors`,
    );
  }

  console.log("---");

  // --- Seed colours ---
  let colorEntries: ColorMappingEntry[];
  try {
    colorEntries = await loadJsonFile<ColorMappingEntry[]>(colorFilePath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to read color file: ${message}`);
    console.log("Skipping color seeding.");
    colorEntries = [];
  }

  if (colorEntries.length > 0) {
    const colorRecords = groupColors(colorEntries);
    console.log(`Found ${colorRecords.length} canonical colours to seed`);

    let colorSuccessCount = 0;
    let colorErrorCount = 0;

    for (const record of colorRecords) {
      try {
        await docClient.send(
          new PutCommand({
            TableName: TABLE_NAME,
            Item: {
              PK: "CANONICAL#COLORS",
              SK: `COLOR#${record.name}`,
              name: record.name,
              aliases: record.aliases,
              createdAt,
            },
          }),
        );
        colorSuccessCount++;
      } catch (err: unknown) {
        colorErrorCount++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Error seeding colour "${record.name}": ${message}`);
      }
    }

    console.log(
      `Colours: ${colorSuccessCount} seeded, ${colorErrorCount} errors`,
    );
  }

  console.log("\n---");
  console.log("Done.");
}

seedCanonicalLists().catch((err: unknown) => {
  console.error("Failed to seed canonical lists:", err);
  process.exit(1);
});
