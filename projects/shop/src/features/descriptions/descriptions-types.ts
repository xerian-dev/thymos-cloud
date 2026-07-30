export interface DescriptionMapping {
  raw: string;
  canonical: string;
}

export interface MappingsResponse {
  mappings: DescriptionMapping[];
  lastModified: string | null;
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
