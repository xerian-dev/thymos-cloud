import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import { jsonResponse } from "../response.js";

const lambdaClient = new LambdaClient({});
const AGGREGATOR_FUNCTION_NAME = process.env.AGGREGATOR_FUNCTION_NAME ?? "";

export async function triggerAggregation(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const command = new InvokeCommand({
      FunctionName: AGGREGATOR_FUNCTION_NAME,
      InvocationType: "Event",
    });

    await lambdaClient.send(command);

    return jsonResponse(200, {
      success: true,
      message: "Aggregation triggered",
    });
  } catch {
    return jsonResponse(500, { error: "internal_error" });
  }
}
