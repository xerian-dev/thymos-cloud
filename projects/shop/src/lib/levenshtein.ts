/**
 * Compute the Levenshtein distance between two strings (case-insensitive).
 */
export function levenshteinDistance(a: string, b: string): number {
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();

  if (aLower === bLower) return 0;
  if (aLower.length === 0) return bLower.length;
  if (bLower.length === 0) return aLower.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= aLower.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= bLower.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= aLower.length; i++) {
    for (let j = 1; j <= bLower.length; j++) {
      const cost = aLower[i - 1] === bLower[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }

  return matrix[aLower.length][bLower.length];
}

/**
 * Find the closest fuzzy match from a list of canonical values.
 * Returns the canonical value if Levenshtein distance <= 2 and the input
 * doesn't already exactly match (case-insensitive).
 */
export function findFuzzyMatch(
  input: string,
  canonicalValues: string[],
): string | null {
  if (!input.trim()) return null;

  const inputLower = input.toLowerCase();

  const hasExactMatch = canonicalValues.some(
    (v) => v.toLowerCase() === inputLower,
  );
  if (hasExactMatch) return null;

  let bestMatch: string | null = null;
  let bestDistance = 3; // threshold: <= 2

  for (const value of canonicalValues) {
    const distance = levenshteinDistance(input, value);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = value;
    }
  }

  return bestMatch;
}
