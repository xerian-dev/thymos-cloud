/** Formats a numeric shop UID as a 7-digit zero-padded string */
export function formatShopUid(uid: number): string {
  return String(uid).padStart(7, "0");
}
