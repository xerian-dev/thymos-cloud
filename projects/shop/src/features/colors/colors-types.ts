export interface ColorMapping {
  raw: string;
  canonical: string;
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
  message?: string;
}
