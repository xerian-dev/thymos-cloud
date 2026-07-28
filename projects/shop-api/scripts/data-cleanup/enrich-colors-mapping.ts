#!/usr/bin/env npx tsx
// Usage: npx tsx scripts/data-cleanup/enrich-colors-mapping.ts
//
// Reads colors-mapping.json, fills in `canonical` values for entries that are
// currently `null` using pattern matching (compound colors, prefixes, separators),
// and writes the file back. Pure local file transformation — no DynamoDB calls.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// --- Types ---

interface ColorMapping {
  raw: string;
  canonical: string | null;
  count: number;
}

// --- Base Color Map (single-word lookups) ---

const BASE_COLOR_MAP: Record<string, string> = {
  // German → English
  blau: "Blue",
  rot: "Red",
  grün: "Green",
  gruen: "Green",
  grun: "Green",
  gelb: "Yellow",
  schwarz: "Black",
  weiss: "White",
  weiß: "White",
  weis: "White",
  braun: "Brown",
  grau: "Grey",
  rosa: "Pink",
  lila: "Purple",
  orange: "Orange",
  violett: "Purple",
  violet: "Purple",
  türkis: "Turquoise",
  turkis: "Turquoise",
  weinrot: "Burgundy",
  silber: "Silver",
  gold: "Gold",
  anthrazit: "Charcoal",
  lachs: "Salmon",
  petrol: "Teal",
  koralle: "Coral",
  mint: "Mint",
  creme: "Cream",
  crème: "Cream",
  natur: "Natural",
  ecru: "Ecru",
  écru: "Ecru",
  apricot: "Apricot",
  flieder: "Lilac",
  neon: "Neon",
  holz: "Wood",
  khaki: "Khaki",
  senf: "Mustard",
  senfgelb: "Mustard",
  rost: "Rust",
  kupfer: "Copper",
  ocker: "Ochre",
  mauve: "Mauve",
  magenta: "Magenta",
  bordeaux: "Burgundy",
  bordeux: "Burgundy",
  bordeau: "Burgundy",
  oliv: "Olive",
  beige: "Beige",
  bunt: "Colorful",
  farbig: "Colorful",
  multi: "Colorful",
  multicolor: "Colorful",
  pink: "Pink",
  jeans: "Jeans",

  // English self-mappings / variants
  red: "Red",
  blue: "Blue",
  green: "Green",
  yellow: "Yellow",
  black: "Black",
  white: "White",
  brown: "Brown",
  grey: "Grey",
  gray: "Grey",
  purple: "Purple",
  orange_en: "Orange", // handled by "orange" above
  pink_en: "Pink", // handled by "pink" above
  navy: "Navy",
  burgundy: "Burgundy",
  charcoal: "Charcoal",
  cream: "Cream",
  ivory: "Ivory",
  silver: "Silver",
  salmon: "Salmon",
  mustard: "Mustard",
  rust: "Rust",
  turquoise: "Turquoise",
  teal: "Teal",
  coral: "Coral",
  olive: "Olive",
  tan: "Tan",
  maroon: "Maroon",
  gold_en: "Gold", // handled by "gold" above
};

// Remove placeholder keys that were added for documentation
delete (BASE_COLOR_MAP as Record<string, string>)["orange_en"];
delete (BASE_COLOR_MAP as Record<string, string>)["pink_en"];
delete (BASE_COLOR_MAP as Record<string, string>)["gold_en"];

// --- Pattern/texture map (previously skipped, now resolved) ---

const PATTERN_MAP: Record<string, string> = {
  gestreift: "Striped",
  gestrieft: "Striped",
  kariert: "Checked",
  herzen: "Hearts",
  punkten: "Dots",
  punkte: "Dots",
  gepunktet: "Dots",
  sterne: "Stars",
  blumen: "Floral",
  blumig: "Floral",
  geblümt: "Floral",
};

// --- Prefix map for compound colors ---

const PREFIXES: Record<string, string> = {
  dunkel: "Dark",
  dunkle: "Dark",
  dunkl: "Dark",
  hell: "Light",
  helle: "Light",
};

// --- Patterns/materials that are NOT colors — leave canonical as null ---

const SKIP_PATTERNS = new Set([
  "diverse",
  "gemustert",
  "leopard",
  "tiger",
  "print",
  "regenbogen",
  "denim",
  "durchsichtig",
]);

// --- Levenshtein Distance (for fuzzy matching) ---

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
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
      if (curr[j] < rowMin) rowMin = curr[j];
    }
    if (rowMin > 2) return rowMin;
    for (let j = 0; j <= bLen; j++) prev[j] = curr[j];
  }
  return prev[bLen];
}

// --- Resolution Logic ---

function lookupBase(normalized: string): string | null {
  return BASE_COLOR_MAP[normalized] ?? null;
}

function lookupAny(normalized: string): string | null {
  return BASE_COLOR_MAP[normalized] ?? PATTERN_MAP[normalized] ?? null;
}

function resolveColor(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();

  // Skip known non-color patterns (exact match)
  if (SKIP_PATTERNS.has(normalized)) return null;

  // Direct lookup (base colors)
  const direct = lookupBase(normalized);
  if (direct) return direct;

  // Direct lookup (patterns)
  const pattern = PATTERN_MAP[normalized];
  if (pattern) return pattern;

  // Try compound with separators (/, space, or -)
  if (
    normalized.includes("/") ||
    normalized.includes(" ") ||
    normalized.includes("-")
  ) {
    const parts = normalized.split(/[/ \-]+/);

    // If any part is a skip pattern, return null (e.g. "blau bunt")
    if (parts.some((p) => SKIP_PATTERNS.has(p))) return null;

    // Handle "mit" (with) — join with spaces, not "/"
    if (parts.includes("mit")) {
      const translated = parts.map((p) => {
        if (p === "mit") return "with";
        return lookupAny(p) ?? resolveSinglePart(p);
      });
      if (translated.every((t) => t !== null)) {
        return (translated as string[]).join(" ");
      }
      return null;
    }

    // Special case: 2-part where first part is a prefix (e.g. "dunkel blau")
    if (parts.length === 2) {
      const prefixValue = PREFIXES[parts[0]];
      if (prefixValue) {
        const baseColor = lookupBase(parts[1]);
        if (baseColor) return `${prefixValue} ${baseColor}`;
      }
    }

    // Try to resolve each part (including prefix-based resolution)
    const translated = parts.map((p) => lookupAny(p) ?? resolveSinglePart(p));
    if (translated.every((t) => t !== null)) {
      return (translated as string[]).join("/");
    }
    return null;
  }

  // Try prefix stripping (dunkel, hell, etc.)
  const prefixResult = tryPrefixStrip(normalized);
  if (prefixResult) return prefixResult;

  // Try compound color split (e.g., "blaugrau" → "Blue/Grey")
  return tryCompoundSplit(normalized);
}

function resolveSinglePart(part: string): string | null {
  const direct = lookupBase(part);
  if (direct) return direct;

  // Try prefix strip on this part too
  return tryPrefixStrip(part);
}

function tryPrefixStrip(normalized: string): string | null {
  // Sort prefixes by length descending so longer prefixes match first
  const sortedPrefixes = Object.entries(PREFIXES).sort(
    (a, b) => b[0].length - a[0].length,
  );

  for (const [prefix, englishPrefix] of sortedPrefixes) {
    if (normalized.startsWith(prefix) && normalized.length > prefix.length) {
      const base = normalized.slice(prefix.length);
      const baseColor = lookupBase(base);
      if (baseColor) return `${englishPrefix} ${baseColor}`;
    }
  }

  return null;
}

/**
 * Try splitting a concatenated word into two known base colors.
 * E.g., "blaugrau" → split at position 4 → "blau" + "grau" → "Blue/Grey"
 * Also handles color+pattern: "blaugestreift" → "Blue/Striped"
 */
function tryCompoundSplit(normalized: string): string | null {
  // Try every possible split point (minimum 2 chars per part)
  for (let i = 2; i <= normalized.length - 2; i++) {
    const left = normalized.slice(0, i);
    const right = normalized.slice(i);

    const leftResolved = lookupBase(left);
    if (!leftResolved) continue;

    // Right side can be a base color, a pattern, or a prefix+color
    const rightResolved = lookupAny(right) ?? tryPrefixStrip(right);
    if (rightResolved) {
      return `${leftResolved}/${rightResolved}`;
    }
  }
  return null;
}

// --- Main ---

function main(): void {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const filePath = resolve(__dirname, "output", "colors-mapping.json");

  console.log(`Reading: ${filePath}`);
  const content = readFileSync(filePath, "utf-8");
  const mappings: ColorMapping[] = JSON.parse(content);

  let resolved = 0;
  let alreadyMapped = 0;
  let stillNull = 0;

  for (const entry of mappings) {
    if (entry.canonical !== null) {
      alreadyMapped++;
      continue;
    }

    const result = resolveColor(entry.raw);
    if (result !== null) {
      entry.canonical = result;
      resolved++;
    } else {
      stillNull++;
    }
  }

  // Second pass: for still-unmapped entries, try just the first word (before first space)
  let resolvedSecondPass = 0;
  for (const entry of mappings) {
    if (entry.canonical !== null) continue;

    const normalized = entry.raw.trim().toLowerCase();
    const spaceIndex = normalized.indexOf(" ");
    if (spaceIndex <= 0) continue; // no space, or starts with space — skip

    const firstWord = normalized.slice(0, spaceIndex);
    const result =
      lookupAny(firstWord) ??
      tryPrefixStrip(firstWord) ??
      tryCompoundSplit(firstWord);
    if (result) {
      entry.canonical = result;
      resolvedSecondPass++;
      stillNull--;
    }
  }

  // Third pass: fuzzy match remaining nulls against all known canonical values
  // Use same proportional threshold as brands: ≤3 chars exact only, 4-5 chars dist≤1, 6+ chars dist≤2
  const allCanonicalValues = new Set<string>();
  for (const entry of mappings) {
    if (entry.canonical !== null) {
      allCanonicalValues.add(entry.canonical);
    }
  }
  // Also add all values from BASE_COLOR_MAP and PATTERN_MAP
  for (const val of Object.values(BASE_COLOR_MAP)) {
    if (val) allCanonicalValues.add(val);
  }
  for (const val of Object.values(PATTERN_MAP)) {
    if (val) allCanonicalValues.add(val);
  }

  const canonicalList = [...allCanonicalValues].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );

  let resolvedThirdPass = 0;
  for (const entry of mappings) {
    if (entry.canonical !== null) continue;

    const normalized = entry.raw.trim().toLowerCase();
    const len = normalized.length;

    // Proportional threshold
    if (len <= 3) continue; // too short for fuzzy matching
    const maxDist = len <= 5 ? 1 : 2;

    let bestMatch: string | null = null;
    let bestDistance = Infinity;

    for (const canonical of canonicalList) {
      // Length pruning
      if (Math.abs(len - canonical.length) > maxDist) continue;

      const dist = levenshteinDistance(normalized, canonical);
      if (dist <= maxDist && dist < bestDistance) {
        bestDistance = dist;
        bestMatch = canonical;
        if (dist === 0) break;
      }
    }

    if (bestMatch) {
      entry.canonical = bestMatch;
      resolvedThirdPass++;
      stillNull--;
    }
  }

  // Write back
  writeFileSync(filePath, JSON.stringify(mappings, null, 2), "utf-8");
  console.log(`\nWritten back to: ${filePath}`);

  // Report
  console.log(`\n--- Summary ---`);
  console.log(`Already mapped:   ${alreadyMapped}`);
  console.log(`Newly resolved (pass 1): ${resolved}`);
  console.log(`Newly resolved (pass 2 - first word): ${resolvedSecondPass}`);
  console.log(`Newly resolved (pass 3 - fuzzy match): ${resolvedThirdPass}`);
  console.log(`Still null:       ${stillNull}`);
  console.log(`Total entries:    ${mappings.length}`);

  // Top 20 remaining nulls by count
  const remaining = mappings
    .filter((m) => m.canonical === null)
    .sort((a, b) => b.count - a.count)
    .slice(0, 20);

  if (remaining.length > 0) {
    console.log(`\n--- Top ${remaining.length} remaining nulls (by count) ---`);
    for (const entry of remaining) {
      console.log(`  ${entry.count.toString().padStart(6)} | ${entry.raw}`);
    }
  }
}

main();
