import { createJobManager } from "./generic-job-manager";

export type {
  JobState,
  ImportPhase,
  ProgressCounts,
  ImportJob,
} from "./generic-job-manager";

const jobManager = createJobManager({ prefix: "ITEM_IMPORT" });

export const createJob = jobManager.createJob;
export const getJob = jobManager.getJob;
export const getRunningOrPausedJob = jobManager.getRunningOrPausedJob;
export const transitionJob = jobManager.transitionJob;
export const updateJobPhase = jobManager.updateJobPhase;
