import { SFNClient, StartExecutionCommand } from "@aws-sdk/client-sfn";
import type { ImportPhase } from "./self-invoker";

const sfnClient = new SFNClient({});
const STATE_MACHINE_ARN: string = process.env.STATE_MACHINE_ARN ?? "";

export async function startStepFunction(
  jobId: string,
  phase: ImportPhase,
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
      }),
    }),
  );
}
