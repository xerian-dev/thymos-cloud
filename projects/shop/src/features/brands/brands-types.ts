export interface BrandEntry {
  canonical: string;
  aliases: string[];
}

export interface BrandCategory {
  categoryId: string | null;
  categoryName: string;
  brands: BrandEntry[];
}

export interface ApplyStatus {
  status: "idle" | "running" | "complete" | "error";
  startedAt?: string;
  completedAt?: string;
  delta?: number;
  itemsUpdated?: number;
  errors?: number;
  canonicalBrandsSeeded?: number;
  message?: string;
}
