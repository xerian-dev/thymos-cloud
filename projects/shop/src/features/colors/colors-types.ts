export interface ColorMapping {
  raw: string;
  canonical: string | null;
  pattern: string | null;
}

export interface MappingsResponse {
  mappings: ColorMapping[];
  lastModified: string | null;
}

export interface ApplyStatus {
  status: "idle" | "running" | "complete" | "error";
  startedAt?: string;
  completedAt?: string;
  delta?: number;
  itemsUpdated?: number;
  errors?: number;
  canonicalColorsSeeded?: number;
  canonicalPatternsSeeded?: number;
  message?: string;
}
