/**
 * Color management API routes.
 *
 * GET  /api/colors/mappings — loads draft.json from S3
 * PUT  /api/colors/mappings — saves edited draft.json to S3
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

const DRAFT_KEY = "color-mappings/draft.json";

interface MappingEntry {
  raw: string;
  canonical: string | null;
  pattern: string | null;
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
      if (typeof entry.raw !== "string") {
        return jsonResponse(400, {
          error: "Each mapping must have a string 'raw' field",
        });
      }
      if (entry.canonical !== null && typeof entry.canonical !== "string") {
        return jsonResponse(400, {
          error: "Each mapping 'canonical' field must be a string or null",
        });
      }
      if (entry.pattern !== null && typeof entry.pattern !== "string") {
        return jsonResponse(400, {
          error: "Each mapping 'pattern' field must be a string or null",
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
