/**
 * REFERENCE FILE: Captured from projects/shop-api/src/patterns/scan-cluster.ts
 * before deletion in task 1.3. Contains the PATTERN_MAP and splitColorPattern
 * logic to be ported into the color scanner in task 3.1.
 *
 * DO NOT import from this file — it is a reference only.
 */

// --- German canonical pattern map ---

export const PATTERN_MAP: Record<string, string> = {
  // Stripes
  gestreift: "Gestreift",
  stripes: "Gestreift",
  striped: "Gestreift",
  streifen: "Gestreift",
  geringelt: "Gestreift",

  // Dots
  punkte: "Punkte",
  dots: "Punkte",
  gepunktet: "Punkte",
  polka: "Punkte",
  tupfen: "Punkte",

  // Checked
  kariert: "Kariert",
  checked: "Kariert",
  karo: "Kariert",
  karos: "Kariert",
  plaid: "Kariert",

  // Printed
  bedruckt: "Bedruckt",
  print: "Bedruckt",
  motiv: "Bedruckt",
  muster: "Bedruckt",
  druck: "Bedruckt",

  // Floral
  blumen: "Blumen",
  floral: "Blumen",
  blümchen: "Blumen",
  geblümt: "Blumen",

  // Animal
  tiere: "Tiere",
  animal: "Tiere",
  tier: "Tiere",
  leopard: "Tiere",
  zebra: "Tiere",
  tiger: "Tiere",

  // Stars
  sterne: "Sterne",
  stars: "Sterne",
  stern: "Sterne",

  // Hearts
  herzen: "Herzen",
  hearts: "Herzen",
  herz: "Herzen",

  // Camouflage
  camouflage: "Camouflage",
  camo: "Camouflage",
  tarn: "Camouflage",
  armee: "Camouflage",

  // Solid / plain
  uni: "Uni",
  einfarbig: "Uni",
  solid: "Uni",
  plain: "Uni",
};

// --- Base color map (reused from color scan-cluster logic) ---

const BASE_COLOR_MAP: Record<string, string> = {
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

const PREFIXES: Record<string, string> = {
  dunkel: "Dunkel",
  hell: "Hell",
  mittel: "Mittel",
  dark: "Dunkel",
  light: "Hell",
};

// --- Color resolution (reuses BASE_COLOR_MAP logic) ---

function lookupCanonicalColor(raw: string): string | null {
  const normalized = raw.trim().toLowerCase();

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

  return null;
}

// --- Splitting algorithm ---

interface SplitResult {
  color: string | null;
  pattern: string | null;
}

export function splitColorPattern(rawValue: string): SplitResult {
  const normalized = rawValue.trim().toLowerCase();

  if (normalized.length === 0) {
    return { color: null, pattern: null };
  }

  // Step 1: Check if entire value is a pattern
  if (PATTERN_MAP[normalized]) {
    return { color: null, pattern: PATTERN_MAP[normalized] };
  }

  // Step 2: Check for compound (color + pattern) with separators
  for (const sep of [" ", "/", "-"]) {
    if (normalized.includes(sep)) {
      const parts = normalized
        .split(sep)
        .map((p) => p.trim())
        .filter((p) => p.length > 0);

      for (let i = 0; i < parts.length; i++) {
        if (PATTERN_MAP[parts[i]]) {
          const patternPart = PATTERN_MAP[parts[i]];
          const colorParts = parts.filter((_, idx) => idx !== i);
          const colorValue = colorParts.join(sep === " " ? "/" : sep);
          const resolvedColor = lookupCanonicalColor(colorValue);
          return {
            color: resolvedColor ?? (colorValue || null),
            pattern: patternPart,
          };
        }
      }
    }
  }

  // Step 3: Check if value contains a pattern word as substring
  for (const [key, canonical] of Object.entries(PATTERN_MAP)) {
    if (normalized.includes(key) && normalized !== key) {
      const remaining = normalized.replace(key, "").trim();
      if (remaining.length > 0) {
        const resolvedColor = lookupCanonicalColor(remaining);
        return {
          color: resolvedColor ?? remaining,
          pattern: canonical,
        };
      }
    }
  }

  // Step 4: Pure color (no pattern detected)
  return { color: rawValue, pattern: null };
}
