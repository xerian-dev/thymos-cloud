/**
 * Description management API routes.
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { jsonResponse, errorResponse } from "../response.js";

const BUCKET_NAME = process.env.BUCKET_NAME ?? "";
const DESC_CLUSTER_FUNCTION_NAME =
  process.env.DESC_CLUSTER_FUNCTION_NAME ?? "";
const DESC_APPLY_FUNCTION_NAME =
  process.env.DESC_APPLY_FUNCTION_NAME ?? "";

const lambdaClient = new LambdaClient({});
const s3Client = new S3Client({});

const DRAFT_KEY = "description-mappings/draft.json";
const STATUS_KEY = "description-mappings/apply-status.json";

interface MappingEntry {
  raw: string;
  canonical: string;
}

export async function scanClusterDescriptions(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: DESC_CLUSTER_FUNCTION_NAME,
        InvocationType: "Event",
      }),
    );

    return jsonResponse(202, {
      message: "Scan & cluster started. Poll GET /api/descriptions/mappings for results.",
    });
  } catch (error: unknown) {
    console.error("scanClusterDescriptions error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

export async function getDescriptionMappings(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: DRAFT_KEY,
      }),
    );

    const body = await result.Body?.transformToString();
    if (!body) {
      return jsonResponse(200, { mappings: [], lastModified: null });
    }

    const mappings: MappingEntry[] = JSON.parse(body);
    const lastModified = result.LastModified?.toISOString() ?? null;

    return jsonResponse(200, { mappings, lastModified });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return jsonResponse(200, { mappings: [], lastModified: null });
    }
    console.error("getDescriptionMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

export async function saveDescriptionMappings(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = event.body;
    if (!body) {
      return jsonResponse(400, { error: "Request body is required" });
    }

    const parsed = JSON.parse(body);
    const mappings: MappingEntry[] = parsed.mappings;

    if (!Array.isArray(mappings)) {
      return jsonResponse(400, { error: "mappings must be an array" });
    }

    for (const entry of mappings) {
      if (typeof entry.raw !== "string" || typeof entry.canonical !== "string") {
        return jsonResponse(400, {
          error: "Each mapping must have string 'raw' and 'canonical' fields",
        });
      }
    }

    const content = JSON.stringify(mappings, null, 2);
    await s3Client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: DRAFT_KEY,
        Body: content,
        ContentType: "application/json",
      }),
    );

    return jsonResponse(200, {
      message: "Draft saved",
      count: mappings.length,
    });
  } catch (error: unknown) {
    console.error("saveDescriptionMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

export async function applyDescriptionMappings(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: DESC_APPLY_FUNCTION_NAME,
        InvocationType: "Event",
      }),
    );

    return jsonResponse(202, {
      message: "Apply started. Poll GET /api/descriptions/apply-status for progress.",
    });
  } catch (error: unknown) {
    console.error("applyDescriptionMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

export async function getDescriptionApplyStatus(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const result = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: STATUS_KEY,
      }),
    );

    const body = await result.Body?.transformToString();
    if (!body) {
      return jsonResponse(200, { status: "idle" });
    }

    return jsonResponse(200, JSON.parse(body));
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return jsonResponse(200, { status: "idle" });
    }
    console.error("getDescriptionApplyStatus error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}
