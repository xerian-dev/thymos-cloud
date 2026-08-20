/**
 * Size management API routes.
 *
 * GET  /api/sizes/mappings — loads draft.json from S3
 * PUT  /api/sizes/mappings — saves edited draft.json to S3
 */

import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { jsonResponse, errorResponse } from "../response.js";

const BUCKET_NAME = process.env.BUCKET_NAME ?? "";

const s3Client = new S3Client({});

const DRAFT_KEY = "size-mappings/draft.json";

// --- GET /api/sizes/mappings ---

export async function getSizeMappings(
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

    const mappings = JSON.parse(body);
    const lastModified = result.LastModified?.toISOString() ?? null;

    return jsonResponse(200, { mappings, lastModified });
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "NoSuchKey") {
      return jsonResponse(200, { mappings: [], lastModified: null });
    }
    console.error("getSizeMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- PUT /api/sizes/mappings ---

export async function saveSizeMappings(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  try {
    const body = event.body;
    if (!body) {
      return jsonResponse(400, { error: "Request body is required" });
    }

    const parsed = JSON.parse(body);
    const mappings = parsed.mappings;

    if (!Array.isArray(mappings)) {
      return jsonResponse(400, { error: "mappings must be an array" });
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
    console.error("saveSizeMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}
