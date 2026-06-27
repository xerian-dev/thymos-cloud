import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});

export const docClient: DynamoDBDocumentClient = DynamoDBDocumentClient.from(
  client,
  {
    marshallOptions: { removeUndefinedValues: true },
  },
);

export const TABLE_NAME: string = process.env.TABLE_NAME ?? "";
