/**
 * Color Scan & Cluster: extracts all distinct color values from items in the
 * shop table, normalizes them to German canonical names, and saves the draft
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

const DRAFT_KEY = "color-mappings/draft.json";

// --- Types ---

interface ColorEntry {
  raw: string;
  count: number;
}

interface ColorMapping {
  raw: string;
  canonical: string;
}

// --- German canonical color map ---

const BASE_COLOR_MAP: Record<string, string> = {
  // Primary German colors
  blau: "Blau",
  rot: "Rot",
  grün: "Grün",
  gruen: "Grün",
  grun: "Grün",
  gelb: "Gelb",
  schwarz: "Schwarz",
  weiss: "Weiss",
  weiß: "Weiss",
  weis: "Weiss",
  braun: "Braun",
  grau: "Grau",
  rosa: "Rosa",
  lila: "Lila",
  orange: "Orange",
  violett: "Violett",
  violet: "Violett",
  pink: "Pink",
  beige: "Beige",
  türkis: "Türkis",
  turkis: "Türkis",
  weinrot: "Weinrot",
  silber: "Silber",
  gold: "Gold",
  anthrazit: "Anthrazit",
  lachs: "Lachs",
  petrol: "Petrol",
  koralle: "Koralle",
  mint: "Mint",
  creme: "Creme",
  khaki: "Khaki",
  olive: "Olive",
  oliv: "Olive",
  neon: "Neon",
  bunt: "Bunt",
  gestreift: "Gestreift",

  // English → German canonical
  red: "Rot",
  blue: "Blau",
  green: "Grün",
  yellow: "Gelb",
  black: "Schwarz",
  white: "Weiss",
  brown: "Braun",
  grey: "Grau",
  gray: "Grau",
  purple: "Lila",
  navy: "Dunkelblau",
  cream: "Creme",
  ivory: "Creme",
  teal: "Petrol",
  turquoise: "Türkis",
  burgundy: "Weinrot",
  maroon: "Weinrot",
  coral: "Koralle",
  salmon: "Lachs",
  silver: "Silber",
  charcoal: "Anthrazit",
  tan: "Beige",
};

// --- German prefixes ---

const PREFIXES: Record<string, string> = {
  dunkel: "Dunkel",
  hell: "Hell",
  mittel: "Mittel",
  dark: "Dunkel",
  light: "Hell",
};

// --- Clustering logic ---

function lookupCanonical(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();

  // Direct lookup
  if (BASE_COLOR_MAP[normalized]) {
    return BASE_COLOR_MAP[normalized];
  }

  // Try prefix + base (e.g., "dunkelblau" → "Dunkelblau")
  for (const [prefix, germanPrefix] of Object.entries(PREFIXES)) {
    if (normalized.startsWith(prefix)) {
      const rest = normalized.slice(prefix.length);
      const base = BASE_COLOR_MAP[rest];
      if (base) {
        return `${germanPrefix}${base.toLowerCase()}`;
      }
    }
  }

  // Try compound with separator (e.g., "blau/grün" → "Blau/Grün")
  for (const sep of ["/", "-", " "]) {
    if (normalized.includes(sep)) {
      const parts = normalized.split(sep);
      const mapped = parts.map((p) => BASE_COLOR_MAP[p.trim()] ?? null);
      if (mapped.every((m) => m !== null)) {
        return mapped.join(sep === " " ? "/" : sep);
      }
    }
  }

  return null;
}

function clusterColors(colors: ColorEntry[]): ColorMapping[] {
  const mappings: ColorMapping[] = [];
  const unmapped: ColorEntry[] = [];

  for (const entry of colors) {
    const canonical = lookupCanonical(entry.raw);
    if (canonical && canonical.toLowerCase() !== entry.raw.toLowerCase()) {
      mappings.push({ raw: entry.raw, canonical });
    } else if (canonical) {
      // Case variant — map to properly cased canonical
      if (entry.raw !== canonical) {
        mappings.push({ raw: entry.raw, canonical });
      }
    } else {
      unmapped.push(entry);
    }
  }

  // For unmapped colors, use Title Case of the raw value as canonical
  // (human can review and fix these)
  for (const entry of unmapped) {
    const titleCase = entry.raw.charAt(0).toUpperCase() + entry.raw.slice(1).toLowerCase();
    if (entry.raw !== titleCase) {
      mappings.push({ raw: entry.raw, canonical: titleCase });
    }
  }

  mappings.sort((a, b) => a.raw.localeCompare(b.raw));
  return mappings;
}

// --- Handler ---

export async function handler(): Promise<void> {
  const startTime = Date.now();

  console.log("[ColorCluster] Starting scan & cluster");
  console.log(`[ColorCluster] Table: ${TABLE_NAME}, Bucket: ${BUCKET_NAME}`);

  // Step 1: Scan all items for color values
  const colorCounts = new Map<string, number>();
  let exclusiveStartKey: Record<string, unknown> | undefined;
  let totalItems = 0;

  do {
    const result = await docClient.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        FilterExpression:
          "begins_with(PK, :prefix) AND SK = :sk AND attribute_exists(color) AND color <> :empty",
        ExpressionAttributeValues: {
          ":prefix": "ITEM#",
          ":sk": "METADATA",
          ":empty": "",
        },
        ProjectionExpression: "color",
        ExclusiveStartKey: exclusiveStartKey,
      }),
    );

    const items = result.Items ?? [];
    totalItems += items.length;

    for (const item of items) {
      const color = item.color as string;
      if (color.trim().length > 0) {
        const current = colorCounts.get(color) ?? 0;
        colorCounts.set(color, current + 1);
      }
    }

    exclusiveStartKey = result.LastEvaluatedKey as
      | Record<string, unknown>
      | undefined;
  } while (exclusiveStartKey);

  console.log(
    `[ColorCluster] Scanned ${totalItems} items with color, found ${colorCounts.size} distinct values`,
  );

  // Step 2: Build sorted entries
  const colors: ColorEntry[] = Array.from(colorCounts.entries())
    .map(([raw, count]) => ({ raw, count }))
    .sort((a, b) => b.count - a.count);

  // Step 3: Cluster
  const mappings = clusterColors(colors);
  console.log(`[ColorCluster] Produced ${mappings.length} mappings`);

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
    `[ColorCluster] Complete. ${mappings.length} mappings written to s3://${BUCKET_NAME}/${DRAFT_KEY} in ${duration}ms`,
  );
}
