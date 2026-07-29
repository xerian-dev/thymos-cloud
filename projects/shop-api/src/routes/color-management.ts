/**
 * Color management API routes.
 *
 * POST /api/colors/scan-cluster  — triggers async scan & cluster Lambda
 * GET  /api/colors/mappings      — loads draft.json from S3
 * PUT  /api/colors/mappings      — saves edited draft.json to S3
 * POST /api/colors/apply         — triggers async apply Lambda
 * GET  /api/colors/apply-status  — polls apply status from S3
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
const COLOR_CLUSTER_FUNCTION_NAME =
  process.env.COLOR_CLUSTER_FUNCTION_NAME ?? "";
const COLOR_APPLY_FUNCTION_NAME =
  process.env.COLOR_APPLY_FUNCTION_NAME ?? "";

const lambdaClient = new LambdaClient({});
const s3Client = new S3Client({});

const DRAFT_KEY = "color-mappings/draft.json";
const STATUS_KEY = "color-mappings/apply-status.json";

interface MappingEntry {
  raw: string;
  canonical: string;
}

// --- POST /api/colors/scan-cluster ---

export async function scanClusterColors(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: COLOR_CLUSTER_FUNCTION_NAME,
        InvocationType: "Event",
      }),
    );

    return jsonResponse(202, {
      message: "Scan & cluster started. Poll GET /api/colors/mappings for results.",
    });
  } catch (error: unknown) {
    console.error("scanClusterColors error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- GET /api/colors/mappings ---

export async function getColorMappings(
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
    console.error("getColorMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- PUT /api/colors/mappings ---

export async function saveColorMappings(
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
    console.error("saveColorMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- POST /api/colors/apply ---

export async function applyColorMappings(
  _event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: COLOR_APPLY_FUNCTION_NAME,
        InvocationType: "Event",
      }),
    );

    return jsonResponse(202, {
      message: "Apply started. Poll GET /api/colors/apply-status for progress.",
    });
  } catch (error: unknown) {
    console.error("applyColorMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- GET /api/colors/apply-status ---

export async function getColorApplyStatus(
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
    console.error("getColorApplyStatus error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}
