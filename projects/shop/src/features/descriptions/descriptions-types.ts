export interface DescriptionEntry {
  canonical: string;
  aliases: string[];
}

export interface DescriptionCategory {
  categoryId: string | null;
  categoryName: string;
  descriptions: DescriptionEntry[];
}

export interface ApplyStatus {
  status: "idle" | "running" | "complete" | "error";
  startedAt?: string;
  completedAt?: string;
  delta?: number;
  itemsUpdated?: number;
  errors?: number;
  canonicalDescriptionsSeeded?: number;
  message?: string;
}
