export interface BrandMapping {
  raw: string;
  canonical: string;
}

export interface MappingsResponse {
  mappings: BrandMapping[];
  lastModified: string | null;
}

export interface ApplyResponse {
  message: string;
  delta: number;
  itemsUpdated: number;
  errors: number;
  canonicalBrandsSeeded: number;
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
