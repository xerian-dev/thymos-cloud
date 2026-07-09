import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

export type ImportPhase = "fetch" | "sync";

export interface SelfInvokePayload {
  action: "resume-internal";
  jobId: string;
  phase: ImportPhase;
}

const lambdaClient = new LambdaClient({});

function getFunctionName(): string {
  const functionName =
    process.env.FUNCTION_NAME ?? process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (!functionName) {
    throw new Error(
      "Neither FUNCTION_NAME nor AWS_LAMBDA_FUNCTION_NAME environment variable is set. Cannot self-invoke.",
    );
  }

  return functionName;
}

export async function invokeSelf(
  jobId: string,
  phase: ImportPhase = "fetch",
): Promise<void> {
  const functionName = getFunctionName();

  const payload: SelfInvokePayload = {
    action: "resume-internal",
    jobId,
    phase,
  };

  console.info(
    JSON.stringify({
      level: "INFO",
      message: "Self-invoking for job continuation",
      jobId,
      phase,
      functionName,
    }),
  );

  const command = new InvokeCommand({
    FunctionName: functionName,
    InvocationType: "Event",
    Payload: new TextEncoder().encode(JSON.stringify(payload)),
  });

  await lambdaClient.send(command);
}
