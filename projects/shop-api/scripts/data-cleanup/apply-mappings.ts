#!/usr/bin/env npx tsx
// Usage: npx tsx scripts/data-cleanup/apply-mappings.ts --type brand scripts/data-cleanup/output/brand-clusters.json
//        npx tsx scripts/data-cleanup/apply-mappings.ts --type color scripts/data-cleanup/output/color-mappings.json
//        npx tsx scripts/data-cleanup/apply-mappings.ts --type brand --dry-run brand-clusters.json
//        npx tsx scripts/data-cleanup/apply-mappings.ts --type brand --concurrency 25 brand-clusters.json
//
// Applies an approved mapping file to items in the shop table.
// Scans the table ONCE, builds an in-memory index of field values → item keys,
// then applies updates concurrently for each mapping entry.
// Preserves the original value in sourceBrand/sourceColor.
// Idempotent: uses conditional writes to avoid overwriting existing preserved values.
//
// Mapping file format: [{ "raw": "Nikke", "canonical": "Nike" }, ...]

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const TABLE_NAME = process.env.TABLE_NAME ?? "thymos-dev-shop";
const REGION = "eu-central-1";

interface MappingEntry {
  raw: string;
  canonical: string;
}

interface ItemKey {
  PK: string;
  SK: string;
}

interface RunSummary {
  totalUpdated: number;
  totalSkipped: number;
  totalErrors: number;
}

interface ParsedArgs {
  type: "brand" | "color";
  filePath: string;
  dryRun: boolean;
  concurrency: number;
}

function parseArgs(argv: string[]): ParsedArgs {
  let type: "brand" | "color" | undefined;
  let filePath: string | undefined;
  let dryRun = false;
  let concurrency = 10;

  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--type" && argv[i + 1]) {
      const value = argv[++i];
      if (value !== "brand" && value !== "color") {
        console.error(
          `Error: --type must be "brand" or "color", got "${value}"`,
        );
        process.exit(1);
      }
      type = value;
    } else if (argv[i] === "--dry-run") {
      dryRun = true;
    } else if (argv[i] === "--concurrency" && argv[i + 1]) {
      const value = parseInt(argv[++i], 10);
      if (isNaN(value) || value < 1) {
        console.error(`Error: --concurrency must be a positive integer`);
        process.exit(1);
      }
      concurrency = value;
    } else if (!argv[i].startsWith("--")) {
      filePath = argv[i];
    }
  }

  if (!type) {
    console.error("Error: --type flag is required (brand or color)");
    process.exit(1);
  }
  if (!filePath) {
    console.error("Error: mapping file path is required");
    process.exit(1);
  }

  return { type, filePath, dryRun, concurrency };
}

async function loadMappings(filePath: string): Promise<MappingEntry[]> {
  const absolutePath = resolve(filePath);
  const content = await readFile(absolutePath, "utf-8");
  const parsed: unknown = JSON.parse(content);

  if (!Array.isArray(parsed)) {
    throw new Error("Mapping file must contain a JSON array");
  }

  const mappings: MappingEntry[] = [];

  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error(
        `Invalid mapping entry: ${JSON.stringify(entry)}. Expected an object with "raw" and "canonical" fields`,
      );
    }

    const raw = (entry as Record<string, unknown>).raw;
    const canonical = (entry as Record<string, unknown>).canonical;

    if (typeof raw !== "string") {
      throw new Error(
        `Invalid mapping entry: ${JSON.stringify(entry)}. "raw" must be a string`,
      );
    }

    // Skip entries where canonical is null (unmapped — not actionable)
    if (canonical === null || canonical === undefined) {
      continue;
    }

    if (typeof canonical !== "string") {
      throw new Error(
        `Invalid mapping entry: ${JSON.stringify(entry)}. "canonical" must be a string or null`,
      );
    }

    mappings.push({ raw, canonical });
  }

  return mappings;
}

async function scanAllItems(
  docClient: DynamoDBDocumentClient,
  field: "brand" | "color",
  rawValues: Set<string>,
): Promise<Map<string, ItemKey[]>> {
  const index = new Map<string, ItemKey[]>();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let totalScanned = 0;
  let totalMatched = 0;
  let pageCount = 0;

  do {
    pageCount++;
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ProjectionExpression: "PK, SK, #field",
        ExpressionAttributeNames: { "#field": field },
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = result.Items ?? [];
    totalScanned += items.length;

    for (const item of items) {
      const value = item[field] as string | undefined;
      if (value && rawValues.has(value)) {
        totalMatched++;
        const list = index.get(value);
        if (list) {
          list.push({ PK: item.PK as string, SK: item.SK as string });
        } else {
          index.set(value, [{ PK: item.PK as string, SK: item.SK as string }]);
        }
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;

    if (pageCount % 10 === 0) {
      console.log(
        `  Scan page ${pageCount}: ${totalScanned.toLocaleString()} items scanned, ${totalMatched.toLocaleString()} matched`,
      );
    }
  } while (exclusiveStartKey);

  console.log(
    `\nScan complete: ${totalScanned.toLocaleString()} items scanned, ${totalMatched.toLocaleString()} items to update across ${index.size} distinct values`,
  );
  return index;
}

async function updateWithConcurrency(
  tasks: (() => Promise<void>)[],
  concurrency: number,
): Promise<void> {
  let index = 0;
  const workers = Array.from({ length: concurrency }, async () => {
    while (index < tasks.length) {
      const i = index++;
      await tasks[i]();
    }
  });
  await Promise.all(workers);
}

async function updateItem(
  docClient: DynamoDBDocumentClient,
  key: ItemKey,
  field: "brand" | "color",
  canonical: string,
  sourceField: "sourceBrand" | "sourceColor",
  rawValue: string,
): Promise<"updated" | "skipped"> {
  // Use conditional write: only set the source field if it doesn't already exist.
  // This makes it idempotent — re-running won't overwrite preserved values.
  try {
    await docClient.send(
      new UpdateCommand({
        TableName: TABLE_NAME,
        Key: { PK: key.PK, SK: key.SK },
        UpdateExpression: "SET #field = :canonical, #sourceField = :rawValue",
        ConditionExpression: "attribute_not_exists(#sourceField)",
        ExpressionAttributeNames: {
          "#field": field,
          "#sourceField": sourceField,
        },
        ExpressionAttributeValues: {
          ":canonical": canonical,
          ":rawValue": rawValue,
        },
      }),
    );
    return "updated";
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.name === "ConditionalCheckFailedException"
    ) {
      // sourceBrand/sourceColor already exists — update the field value only
      await docClient.send(
        new UpdateCommand({
          TableName: TABLE_NAME,
          Key: { PK: key.PK, SK: key.SK },
          UpdateExpression: "SET #field = :canonical",
          ExpressionAttributeNames: {
            "#field": field,
          },
          ExpressionAttributeValues: {
            ":canonical": canonical,
          },
        }),
      );
      return "skipped";
    }
    throw err;
  }
}

async function applyMappings(): Promise<void> {
  const { type, filePath, dryRun, concurrency } = parseArgs(process.argv);
  const field: "brand" | "color" = type;
  const sourceField: "sourceBrand" | "sourceColor" =
    type === "brand" ? "sourceBrand" : "sourceColor";

  console.log(`Table: ${TABLE_NAME}`);
  console.log(`Region: ${REGION}`);
  console.log(`Type: ${type}`);
  console.log(`Mapping file: ${filePath}`);
  console.log(`Concurrency: ${concurrency}`);
  if (dryRun) {
    console.log(`Mode: DRY RUN (no writes will be performed)`);
  }
  console.log("---");

  const mappings = await loadMappings(filePath);
  console.log(`Loaded ${mappings.length} mapping entries`);

  // Filter out identity mappings upfront
  const effectiveMappings = mappings.filter((m) => m.raw !== m.canonical);
  const identityCount = mappings.length - effectiveMappings.length;
  if (identityCount > 0) {
    console.log(
      `Skipping ${identityCount} identity mappings (raw === canonical)`,
    );
  }
  console.log(`Effective mappings to apply: ${effectiveMappings.length}`);
  console.log("---");

  // Build set of all raw values for fast lookup during scan
  const rawValues = new Set(effectiveMappings.map((m) => m.raw));
  console.log(`Distinct raw values to search for: ${rawValues.size}`);
  console.log(`\nScanning table...`);

  const client = new DynamoDBClient({ region: REGION });
  const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: { removeUndefinedValues: true },
  });

  // Single scan to build index
  const index = await scanAllItems(docClient, field, rawValues);

  if (dryRun) {
    console.log(`\n--- DRY RUN REPORT ---`);
    let totalWouldUpdate = 0;
    for (const mapping of effectiveMappings) {
      const items = index.get(mapping.raw);
      if (items && items.length > 0) {
        console.log(
          `  "${mapping.raw}" → "${mapping.canonical}": ${items.length} items`,
        );
        totalWouldUpdate += items.length;
      }
    }
    console.log(
      `\nTotal items that would be updated: ${totalWouldUpdate.toLocaleString()}`,
    );
    return;
  }

  // Apply updates
  const summary: RunSummary = {
    totalUpdated: 0,
    totalSkipped: 0,
    totalErrors: 0,
  };

  let mappingsProcessed = 0;

  for (const mapping of effectiveMappings) {
    const items = index.get(mapping.raw);

    if (!items || items.length === 0) {
      mappingsProcessed++;
      continue;
    }

    let mappingUpdated = 0;
    let mappingSkipped = 0;
    let mappingErrors = 0;

    const tasks = items.map((key) => async () => {
      try {
        const result = await updateItem(
          docClient,
          key,
          field,
          mapping.canonical,
          sourceField,
          mapping.raw,
        );
        if (result === "updated") {
          mappingUpdated++;
        } else {
          mappingSkipped++;
        }
      } catch (err: unknown) {
        mappingErrors++;
        const message = err instanceof Error ? err.message : String(err);
        console.error(`  Error updating item ${key.PK}/${key.SK}: ${message}`);
      }
    });

    await updateWithConcurrency(tasks, concurrency);

    summary.totalUpdated += mappingUpdated;
    summary.totalSkipped += mappingSkipped;
    summary.totalErrors += mappingErrors;
    mappingsProcessed++;

    if (
      mappingsProcessed % 50 === 0 ||
      mappingsProcessed === effectiveMappings.length
    ) {
      console.log(
        `  Progress: ${mappingsProcessed}/${effectiveMappings.length} mappings processed, ${summary.totalUpdated.toLocaleString()} items updated`,
      );
    }

    if (mappingUpdated > 0 || mappingSkipped > 0) {
      console.log(
        `Updated ${mappingUpdated} items for mapping: "${mapping.raw}" → "${mapping.canonical}"${mappingSkipped > 0 ? ` (${mappingSkipped} already had ${sourceField})` : ""}`,
      );
    }
  }

  // Summary
  console.log("\n---");
  console.log("Summary:");
  console.log(`  Total updated: ${summary.totalUpdated}`);
  console.log(
    `  Total skipped (${sourceField} already present): ${summary.totalSkipped}`,
  );
  console.log(`  Total errors: ${summary.totalErrors}`);
}

applyMappings().catch((err: unknown) => {
  console.error("Failed to apply mappings:", err);
  process.exit(1);
});
