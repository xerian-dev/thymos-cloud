/**
 * Sequence counter logic for Shop UID management.
 *
 * This utility implements the rules governing how the account sequence counter
 * is updated after a new account is created. The frontend calls the API to get
 * the next available number; this module serves as a backend logic reference
 * and is used for property-based testing.
 */

/** Maximum valid account number (7-digit upper bound) */
export const MAX_ACCOUNT_NUMBER = 9999999;

/**
 * Computes the next sequence counter value after an account is created.
 *
 * Rules:
 * - If the used UID equals the current counter (default sequential): counter + 1
 * - If the used UID exceeds the current counter (user override higher): usedUid + 1
 * - If the used UID is less than the current counter (user override lower): no change
 *
 * Combined: if usedUid >= currentCounter → usedUid + 1, otherwise currentCounter.
 *
 * @param currentCounter - The current sequence counter value (next available UID)
 * @param usedUid - The UID that was just used to create an account
 * @returns The new sequence counter value
 */
export function computeNextCounter(
  currentCounter: number,
  usedUid: number,
): number {
  if (usedUid >= currentCounter) {
    return usedUid + 1;
  }
  return currentCounter;
}

/**
 * Determines whether an account can be created given the next counter value.
 * Returns false if creating the account would push the counter beyond MAX_ACCOUNT_NUMBER.
 *
 * @param nextCounter - The value the counter would become after creation
 * @returns true if the counter is within the valid range
 */
export function canCreateAccount(nextCounter: number): boolean {
  return nextCounter <= MAX_ACCOUNT_NUMBER;
}
