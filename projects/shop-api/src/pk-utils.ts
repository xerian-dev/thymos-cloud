const ACCOUNT_PREFIX = "ACCOUNT#";
const PAD_LENGTH = 7;

/**
 * Constructs a DynamoDB PK from a UUID.
 * Example: buildAccountUuidPk("abc-123") → "ACCOUNT#abc-123"
 */
export function buildAccountUuidPk(uuid: string): string {
  return `${ACCOUNT_PREFIX}${uuid}`;
}

/**
 * Formats an account number as a 7-digit zero-padded string.
 * Example: formatAccountNumber(42) → "0000042"
 */
export function formatAccountNumber(accountNumber: number): string {
  return String(accountNumber).padStart(PAD_LENGTH, "0");
}
