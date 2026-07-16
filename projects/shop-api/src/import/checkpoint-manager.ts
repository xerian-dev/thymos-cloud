export type { ProgressCounts, Checkpoint } from "./generic-checkpoint-manager";
import { createCheckpointManager } from "./generic-checkpoint-manager";

const checkpointMgr = createCheckpointManager({ prefix: "ITEM_IMPORT" });

export const saveCheckpoint = checkpointMgr.saveCheckpoint;
export const loadCheckpoint = checkpointMgr.loadCheckpoint;
