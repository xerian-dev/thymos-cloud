const ACCOUNT_PREFIX = "ACCOUNT#";
const PAD_LENGTH = 7;

/**
 * Constructs a DynamoDB PK from an account number.
 * Example: buildAccountPk(42) → "ACCOUNT#0000042"
 */
export function buildAccountPk(accountNumber: number): string {
  return `${ACCOUNT_PREFIX}${formatAccountNumber(accountNumber)}`;
}

/**
 * Parses an account number from a DynamoDB PK.
 * Example: parseAccountPk("ACCOUNT#0000042") → 42
 */
export function parseAccountPk(pk: string): number {
  const numericPart = pk.slice(ACCOUNT_PREFIX.length);
  return parseInt(numericPart, 10);
}

/**
 * Formats an account number as a 7-digit zero-padded string.
 * Example: formatAccountNumber(42) → "0000042"
 */
export function formatAccountNumber(accountNumber: number): string {
  return String(accountNumber).padStart(PAD_LENGTH, "0");
}
