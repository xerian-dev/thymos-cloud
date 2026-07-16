import type { Sale } from "./sales-types";

// Converts cents integer to "CHF X.XX" display format
// e.g., 4250 → "CHF 42.50", 0 → "CHF 0.00"
export function formatChfCents(cents: number): string {
  const amount = (cents / 100).toFixed(2);
  return `CHF ${amount}`;
}

// Formats ISO date string to readable date, or returns "—" if undefined
export function formatSaleDate(isoString: string | undefined): string {
  if (!isoString) return "—";
  const date = new Date(isoString);
  return date.toLocaleDateString("de-CH", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Returns Tailwind classes for status badge styling
// - open: neutral
// - finalized: success/green
// - voided: destructive/red
export function getStatusVariant(status: Sale["status"]): string {
  switch (status) {
    case "open":
      return "bg-muted text-muted-foreground";
    case "finalized":
      return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "voided":
      return "bg-destructive/10 text-destructive";
  }
}
