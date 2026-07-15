import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { ImportPhase } from "./self-invoker";

const sfnClient = new SFNClient({});
const STATE_MACHINE_ARN: string = process.env.STATE_MACHINE_ARN ?? "";

export type ImportJobType = "item" | "sale";

export interface StartStepFunctionOptions {
  jobId: string;
  phase: ImportPhase;
  type: ImportJobType;
  createdAfter?: string;
}

export async function startStepFunction(
  jobId: string,
  phase: ImportPhase,
  type: ImportJobType = "item",
): Promise<void> {
  if (!STATE_MACHINE_ARN) {
    throw new Error(
      "STATE_MACHINE_ARN environment variable is not set. Cannot start Step Function.",
    );
  }

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Starting Step Function execution",
      jobId,
      phase,
      type,
      stateMachineArn: STATE_MACHINE_ARN,
    }),
  );

  await sfnClient.send(
    new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: `import-${jobId}-${phase}-${Date.now()}`,
      input: JSON.stringify({
        action: "resume-internal",
        jobId,
        phase,
        type,
      }),
    }),
  );
}

export async function startStepFunctionForSync(
  options: StartStepFunctionOptions,
): Promise<string> {
  const { jobId, phase, type, createdAfter } = options;

  if (!STATE_MACHINE_ARN) {
    throw new Error(
      "STATE_MACHINE_ARN environment variable is not set. Cannot start Step Function.",
    );
  }

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Starting Step Function execution for sync",
      jobId,
      phase,
      type,
      createdAfter: createdAfter ?? null,
      stateMachineArn: STATE_MACHINE_ARN,
    }),
  );

  const input: Record<string, string> = {
    action: "resume-internal",
    jobId,
    phase,
    type,
  };

  if (createdAfter != null) {
    input.createdAfter = createdAfter;
  }

  const result = await sfnClient.send(
    new StartExecutionCommand({
      stateMachineArn: STATE_MACHINE_ARN,
      name: `import-${jobId}-${phase}-${Date.now()}`,
      input: JSON.stringify(input),
    }),
  );

  return result.executionArn!;
}
