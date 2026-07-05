import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { s3Client, BUCKET_NAME } from "../s3-client.js";
import { jsonResponse, errorResponse } from "../response.js";

const ALLOWED_CONTENT_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const CONTENT_TYPE_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const PRESIGN_EXPIRES_IN_SECONDS = 900; // 15 minutes

export async function presignUpload(
  event: APIGatewayProxyEventV2,
): Promise<APIGatewayProxyResultV2> {
  // 1. Parse JSON body
  let body: unknown;
  try {
    body = JSON.parse(event.body ?? "");
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  // 2. Validate required fields
  if (
    typeof body !== "object" ||
    body === null ||
    !("filename" in body) ||
    !("contentType" in body)
  ) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: [
        { field: "filename", message: "filename is required" },
        { field: "contentType", message: "contentType is required" },
      ],
    });
  }

  const { filename, contentType } = body as {
    filename: unknown;
    contentType: unknown;
  };

  if (typeof filename !== "string" || filename.trim().length === 0) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: [
        { field: "filename", message: "filename must be a non-empty string" },
      ],
    });
  }

  if (
    typeof contentType !== "string" ||
    !ALLOWED_CONTENT_TYPES.has(contentType)
  ) {
    return jsonResponse(400, {
      error: "validation_error",
      fields: [
        {
          field: "contentType",
          message:
            "contentType must be one of: image/jpeg, image/png, image/webp",
        },
      ],
    });
  }

  // 3. Generate S3 key: items/<itemUuid>/<randomId>.<ext>
  const itemUuid = randomUUID();
  const randomId = randomUUID();
  const ext = CONTENT_TYPE_TO_EXT[contentType];
  const s3Key = `items/${itemUuid}/${randomId}.${ext}`;

  // 4. Generate presigned PUT URL
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(s3Client, command, {
      expiresIn: PRESIGN_EXPIRES_IN_SECONDS,
    });

    return jsonResponse(200, { uploadUrl, s3Key });
  } catch {
    return errorResponse();
  }
}
