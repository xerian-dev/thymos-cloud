/**
 * Brand management API routes.
 *
 * GET  /api/brands/mappings — loads draft.json from S3
 * PUT  /api/brands/mappings — saves edited draft.json to S3
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

const DRAFT_KEY = "brand-mappings/draft.json";

// --- GET /api/brands/mappings ---

export async function getMappings(
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
    console.error("getMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}

// --- PUT /api/brands/mappings ---

export async function saveMappings(
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
    console.error("saveMappings error", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return errorResponse();
  }
}
