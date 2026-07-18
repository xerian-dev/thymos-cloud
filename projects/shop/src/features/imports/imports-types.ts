import type { PageSize } from "@/lib/pagination-types";

export type ImportType = "items" | "sales" | "accounts";

export type JobState = "running" | "paused" | "failed" | "complete";

export type ImportPhase = "fetch" | "sync";

export interface ProgressCounts {
  processed: number;
  imported: number;
  skipped: number;
  failed: number;
}

export interface FailureEntry {
  itemId: string;
  error: string;
}

export interface ImportReport {
  jobId: string;
  totalProcessed: number;
  imported: number;
  skipped: number;
  failed: number;
  elapsedSeconds: number;
  failures: FailureEntry[];
  truncated: boolean;
  totalFailures: number;
  completedAt: string;
}

export interface ImportJobStatus {
  jobId: string;
  state: JobState;
  phase: ImportPhase;
  startedAt: string;
  lastUpdatedAt: string;
  progress: ProgressCounts;
  error?: string;
  report?: ImportReport;
}

export interface ImportStatusResponse {
  items: ImportJobStatus | null;
  sales: ImportJobStatus | null;
  accounts: ImportJobStatus | null;
}

export interface ActionButtonStates {
  startEnabled: boolean;
  resumeVisible: boolean;
  cancelVisible: boolean;
}

export interface HistoryJobSummary {
  jobId: string;
  state: JobState;
  phase: ImportPhase;
  startedAt: string;
  lastUpdatedAt: string;
  progress: ProgressCounts;
  error?: string;
  report?: ImportReport;
}

export interface ImportHistoryResponse {
  jobs: HistoryJobSummary[];
  nextToken?: string;
}

export interface ImportHistoryParams {
  type: ImportType;
  pageSize: PageSize;
  nextToken?: string;
}
