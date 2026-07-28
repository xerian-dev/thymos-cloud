/**
 * Computes the Levenshtein distance between two strings (case-insensitive).
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  const aLen = aLower.length;
  const bLen = bLower.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;
  const prev: number[] = Array.from({ length: bLen + 1 }, (_, i) => i);
  const curr: number[] = new Array(bLen + 1);
  for (let i = 1; i <= aLen; i++) {
    curr[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    for (let j = 0; j <= bLen; j++) prev[j] = curr[j];
  }
  return prev[bLen];
}

/**
 * Returns canonical brands from the list that fuzzy-match the input (Levenshtein <= 2).
 */
export function fuzzyMatchBrands(
  input: string,
  canonicalBrands: string[],
): string[] {
  return canonicalBrands.filter(
    (brand) => levenshteinDistance(input, brand) <= 2,
  );
}
