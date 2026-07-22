/** Formats an account number as a 7-digit zero-padded string */
export function formatAccountNumber(accountNumber: number): string {
  return String(accountNumber).padStart(7, "0");
}
