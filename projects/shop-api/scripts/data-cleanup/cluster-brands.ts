#!/usr/bin/env npx tsx
// Usage: npx tsx scripts/data-cleanup/cluster-brands.ts
//
// Reads the raw brand extraction output (brands-raw.json) and clusters
// similar brand names using Levenshtein distance with a "canonical attraction"
// algorithm. Each brand maps to at most ONE canonical brand (no transitive chains).
//
// Algorithm:
// 1. Consolidate case variants: group exact case-insensitive duplicates,
//    pick the best canonical form (Title Case > mixed > lower > ALL CAPS),
//    and sum their counts.
// 2. Sort consolidated brands by count descending (highest-count brands are
//    canonical attractors).
// 3. Iterate through sorted list. For each brand, check if it's within
//    Levenshtein distance of any canonical brand (higher-count brands processed
//    earlier). Distance thresholds are proportional to brand length:
//    - ≤ 3 chars: exact case-insensitive match only (no fuzzy matching)
//    - 4–5 chars: distance ≤ 1
//    - 6+ chars: distance ≤ 2
// 4. After clustering, expand mappings to include all original case variants
//    that weren't selected as canonical.
//
// Input:  scripts/data-cleanup/output/brands-raw.json
// Output: scripts/data-cleanup/output/brand-clusters.json

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Types ---

interface BrandEntry {
  brand: string;
  count: number;
}

interface BrandMapping {
  raw: string;
  canonical: string;
}

// --- Levenshtein distance (standard DP implementation) ---

function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  const aLen = aLower.length;
  const bLen = bLower.length;

  // Early exits
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  if (aLower === bLower) return 0;

  // Use single-row DP for space efficiency
  const prev: number[] = Array.from({ length: bLen + 1 }, (_, i) => i);
  const curr: number[] = new Array(bLen + 1);

  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bLen; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost, // substitution
      );
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    // Early bail-out: if the minimum value in this row > 2, final result must be > 2
    if (rowMin > 2) return rowMin;
    // Copy curr to prev for next iteration
    for (let j = 0; j <= bLen; j++) {
      prev[j] = curr[j];
    }
  }

  return prev[bLen];
}

// --- Proportional distance threshold ---

function maxAllowedDistance(len: number): number {
  if (len <= 3) return 0; // exact only (handled separately)
  if (len <= 5) return 1;
  return 2;
}

// --- Canonical form selection ---

/**
 * For each set of case-insensitive duplicates, pick the best canonical form.
 * Priority: Title Case > lower case > ALL CAPS. Among ties, highest count.
 */
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
    // Sum all counts for this group
    const totalCount = group.reduce((sum, e) => sum + e.count, 0);
    // Pick the best brand name form
    const bestForm = pickCanonicalForm(group);
    consolidated.push({ brand: bestForm, count: totalCount });
  }

  return consolidated;
}

function pickCanonicalForm(variants: BrandEntry[]): string {
  // Score each variant: Title Case > mixed > lower > ALL CAPS
  function formScore(name: string): number {
    if (name.length === 0) return 0;
    const startsUpper = /^[A-Z]/.test(name);
    const isAllCaps = name === name.toUpperCase() && /[A-Z]/.test(name);
    const isAllLower = name === name.toLowerCase();

    if (startsUpper && !isAllCaps) return 3; // Title Case (best)
    if (startsUpper && isAllCaps && name.length <= 4) return 2; // Short acronyms like "H&M", "UGG" are fine
    if (isAllCaps) return 1; // ALL CAPS (less preferred)
    if (isAllLower) return 0; // all lower (least preferred)
    return 2; // mixed case
  }

  // Sort by form score desc, then by count desc
  const sorted = [...variants].sort((a, b) => {
    const scoreDiff = formScore(b.brand) - formScore(a.brand);
    if (scoreDiff !== 0) return scoreDiff;
    return b.count - a.count;
  });

  return sorted[0].brand;
}

// --- Clustering logic (canonical attraction — no transitive merging) ---

function clusterBrands(brands: BrandEntry[]): BrandMapping[] {
  // Step 1: Consolidate case variants (pick best form, sum counts)
  console.log(`\nConsolidating case variants...`);
  const consolidated = consolidateCaseVariants(brands);
  console.log(
    `  ${brands.length} raw brands → ${consolidated.length} unique (case-insensitive)`,
  );

  // Step 2: Sort by count descending — high-count brands are canonical attractors
  const sorted = [...consolidated].sort((a, b) => b.count - a.count);

  const mappings: BrandMapping[] = [];
  const canonicalBrands: BrandEntry[] = []; // brands that haven't been claimed as variants

  const startTime = Date.now();
  let lastLogTime = startTime;

  console.log(`\nClustering ${sorted.length} brands (canonical attraction)...`);

  for (let i = 0; i < sorted.length; i++) {
    const current = sorted[i];
    const currentLower = current.brand.toLowerCase();
    const currentLen = current.brand.length;

    // Short brands (≤ 3 chars): only match exact case-insensitive duplicates
    const useExactOnly = currentLen <= 3;
    const threshold = maxAllowedDistance(currentLen);

    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const canonical of canonicalBrands) {
      if (useExactOnly) {
        // For short brands, only match if case-insensitive equal
        if (canonical.brand.toLowerCase() === currentLower) {
          bestMatch = canonical.brand;
          bestDistance = 0;
          break;
        }
        continue;
      }

      // Length pruning: if lengths differ by more than threshold, distance > threshold guaranteed
      if (Math.abs(currentLen - canonical.brand.length) > threshold) continue;

      const dist = levenshteinDistance(current.brand, canonical.brand);
      if (dist <= threshold && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = canonical.brand;
        if (dist === 0) break; // exact match, can't do better
      }
    }

    if (bestMatch && bestMatch !== current.brand) {
      mappings.push({ raw: current.brand, canonical: bestMatch });
    } else {
      // This brand becomes a canonical (attractor)
      canonicalBrands.push(current);
    }

    // Progress logging every 2 seconds
    const now = Date.now();
    if (now - lastLogTime >= 2000) {
      const elapsed = (now - startTime) / 1000;
      const progress = (i + 1) / sorted.length;
      const eta = progress > 0 ? (elapsed / progress) * (1 - progress) : 0;
      console.log(
        `  Progress: ${(progress * 100).toFixed(1)}% | ` +
          `Brand ${i + 1}/${sorted.length} | ` +
          `Canonical: ${canonicalBrands.length} | ` +
          `Mapped: ${mappings.length} | ` +
          `ETA: ${Math.round(eta)}s`,
      );
      lastLogTime = now;
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nClustering complete in ${totalTime}s`);
  console.log(`  Total consolidated brands: ${sorted.length}`);
  console.log(`  Canonical brands: ${canonicalBrands.length}`);
  console.log(`  Mapped variants (fuzzy): ${mappings.length}`);

  // Step 3: Expand back to include all original case variant mappings
  const caseVariantMappings: BrandMapping[] = [];
  const caseGroups = new Map<string, BrandEntry[]>();
  for (const entry of brands) {
    const key = entry.brand.toLowerCase();
    const group = caseGroups.get(key);
    if (group) group.push(entry);
    else caseGroups.set(key, [entry]);
  }

  // Add case-variant mappings for brands that stayed canonical
  for (const group of caseGroups.values()) {
    const canonical = pickCanonicalForm(group);
    for (const entry of group) {
      if (entry.brand !== canonical) {
        caseVariantMappings.push({ raw: entry.brand, canonical });
      }
    }
  }

  // Also, for brands that got mapped to a canonical in clustering,
  // map all their case variants to that canonical too
  for (const mapping of [...mappings]) {
    // mapping.raw is the consolidated form. Find all original case variants of mapping.raw
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

  console.log(`  Case variant mappings added: ${caseVariantMappings.length}`);
  console.log(`  Total deduplicated mappings: ${deduplicated.length}`);

  return deduplicated;
}

// --- Main ---

function main(): void {
  const inputPath = resolve(__dirname, "output/brands-raw.json");
  const outputDir = resolve(__dirname, "output");
  const outputPath = resolve(outputDir, "brand-clusters.json");

  console.log(`Reading brands from: ${inputPath}`);

  let rawData: string;
  try {
    rawData = readFileSync(inputPath, "utf-8");
  } catch (err) {
    console.error(
      `Error: Could not read ${inputPath}. Run extract-brands.ts first.`,
    );
    process.exit(1);
  }

  const brands: BrandEntry[] = JSON.parse(rawData);
  console.log(`Loaded ${brands.length} distinct brand values`);

  const mappings = clusterBrands(brands);

  console.log(`\nFound ${mappings.length} brand variants to map`);

  // Count distinct canonical values in mappings
  const canonicalSet = new Set(mappings.map((m) => m.canonical));
  console.log(
    `Clusters with variants: ${canonicalSet.size} (brands that have at least one similar variant)`,
  );

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(outputPath, JSON.stringify(mappings, null, 2) + "\n");

  console.log(`Output written to: ${outputPath}`);
  console.log("\nSample mappings (first 10):");
  for (const m of mappings.slice(0, 10)) {
    console.log(`  "${m.raw}" → "${m.canonical}"`);
  }
}

main();
