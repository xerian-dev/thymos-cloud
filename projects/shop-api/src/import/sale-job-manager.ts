import { createJobManager } from "./generic-job-manager";
import type { ImportPhase, ProgressCounts } from "./job-manager";

export type SaleJobState =
  | "running"
  | "paused"
  | "failed"
  | "complete"
  | "cancelled";

export interface SaleImportJob {
  jobId: string;
  state: SaleJobState;
  phase: ImportPhase;
  startedAt: string;
  lastUpdatedAt: string;
  filterParams: { createdAfter?: string };
  error?: string;
  progress: ProgressCounts;
}

const saleJobManager = createJobManager({
  prefix: "SALE_IMPORT",
  entityLabel: "Sale job",
});

export async function createSaleJob(filterParams: {
  createdAfter?: string;
}): Promise<SaleImportJob> {
  return saleJobManager.createJob(filterParams);
}

export async function getSaleJob(jobId: string): Promise<SaleImportJob | null> {
  return saleJobManager.getJob(jobId);
}

export async function getRunningSaleJob(): Promise<SaleImportJob | null> {
  return saleJobManager.getRunningOrPausedJob();
}

export async function transitionSaleJob(
  jobId: string,
  state: SaleJobState,
  progress: ProgressCounts,
  error?: string,
): Promise<void> {
  return saleJobManager.transitionJob(jobId, state, progress, error);
}

export async function updateSaleJobPhase(
  jobId: string,
  phase: ImportPhase,
): Promise<void> {
  return saleJobManager.updateJobPhase(jobId, phase);
}
