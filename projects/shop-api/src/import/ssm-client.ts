import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";

const ssmClient = new SSMClient({});

export async function getConsignCloudApiKey(): Promise<string> {
  const parameterPath = process.env.SSM_API_KEY_PATH;

  if (!parameterPath) {
    throw new Error(
      "SSM_API_KEY_PATH environment variable is not set. Cannot retrieve ConsignCloud API key.",
    );
  }

  const command = new GetParameterCommand({
    Name: parameterPath,
    WithDecryption: true,
  });

  const response = await ssmClient.send(command);

  if (!response.Parameter) {
    throw new Error(
      `SSM parameter not found at path: ${parameterPath}. Ensure the parameter exists in Parameter Store.`,
    );
  }

  const value = response.Parameter.Value;

  if (!value || value.trim().length === 0) {
    throw new Error(
      `SSM parameter at path '${parameterPath}' has an empty value. Please set a valid ConsignCloud API key.`,
    );
  }

  return value;
}
