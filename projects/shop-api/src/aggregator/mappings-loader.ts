/**
 * Loads canonical mapping files from S3 and builds in-memory lookup maps.
 *
 * Mapping files:
 * - brand-mappings/draft.json: [{ categoryId, categoryName, brands: [{ canonical, aliases }] }]
 * - description-mappings/draft.json: [{ categoryId, categoryName, descriptions: [{ canonical, aliases }] }]
 * - color-mappings/draft.json: [{ raw, canonical, pattern }]
 * - size-mappings/draft.json: [{ categoryId, categoryName, sizes: string[] }]
 *
 * The lookup maps resolve raw values to canonical values. For brand and description,
 * the format is grouped by category but we flatten aliases into a single map since
 * pricing groups by brand×description regardless of category.
 */

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const s3Client = new S3Client({});

export interface CanonicalMappings {
  brand: Map<string, string>;
  description: Map<string, string>;
  color: Map<string, string>;
  pattern: Map<string, string>;
  size: Map<string, string>;
}

interface BrandCategory {
  categoryId: string | null;
  categoryName: string;
  brands: { canonical: string; aliases: string[] }[];
}

interface DescriptionCategory {
  categoryId: string | null;
  categoryName: string;
  descriptions: { canonical: string; aliases: string[] }[];
}

interface ColorMapping {
  raw: string;
  canonical: string | null;
  pattern: string | null;
}

interface SizeCategory {
  categoryId: string | null;
  categoryName: string;
  sizes: string[];
}

async function loadJsonFromS3(
  bucket: string,
  key: string,
): Promise<unknown | null> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    const body = await result.Body?.transformToString();
    if (!body) return null;
    return JSON.parse(body);
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return null;
    }
    throw error;
  }
}

function buildBrandMap(data: BrandCategory[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const category of data) {
    for (const brand of category.brands) {
      for (const alias of brand.aliases) {
        map.set(alias, brand.canonical);
      }
    }
  }
  return map;
}

function buildDescriptionMap(data: DescriptionCategory[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const category of data) {
    for (const desc of category.descriptions) {
      for (const alias of desc.aliases) {
        map.set(alias, desc.canonical);
      }
    }
  }
  return map;
}

function buildColorAndPatternMaps(
  data: ColorMapping[],
): { color: Map<string, string>; pattern: Map<string, string> } {
  const color = new Map<string, string>();
  const pattern = new Map<string, string>();

  for (const entry of data) {
    if (entry.canonical) {
      color.set(entry.raw, entry.canonical);
    }
    if (entry.pattern) {
      pattern.set(entry.raw, entry.pattern);
    }
  }

  return { color, pattern };
}

function buildSizeMap(data: SizeCategory[]): Map<string, string> {
  // Size mappings currently store raw values only (no canonical mapping yet).
  // For now, the identity map is used — raw value maps to itself.
  // When canonical size mappings are added, this will resolve aliases.
  const map = new Map<string, string>();
  for (const category of data) {
    for (const size of category.sizes) {
      map.set(size, size);
    }
  }
  return map;
}

export async function loadCanonicalMappings(
  bucket: string,
): Promise<CanonicalMappings> {
  const [brandData, descData, colorData, sizeData] = await Promise.all([
    loadJsonFromS3(bucket, "brand-mappings/draft.json"),
    loadJsonFromS3(bucket, "description-mappings/draft.json"),
    loadJsonFromS3(bucket, "color-mappings/draft.json"),
    loadJsonFromS3(bucket, "size-mappings/draft.json"),
  ]);

  const brand = brandData
    ? buildBrandMap(brandData as BrandCategory[])
    : new Map<string, string>();

  const description = descData
    ? buildDescriptionMap(descData as DescriptionCategory[])
    : new Map<string, string>();

  const { color, pattern } = colorData
    ? buildColorAndPatternMaps(colorData as ColorMapping[])
    : { color: new Map<string, string>(), pattern: new Map<string, string>() };

  const size = sizeData
    ? buildSizeMap(sizeData as SizeCategory[])
    : new Map<string, string>();

  return { brand, description, color, pattern, size };
}
