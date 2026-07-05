import { describe, it, expect, vi, beforeEach } from "vitest";
import { randomUUID } from "node:crypto";

vi.mock("../../src/s3-client.js", () => ({
  s3Client: {},
  BUCKET_NAME: "test-bucket",
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: vi.fn(),
}));

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(),
}));

import { presignUpload } from "../../src/routes/presign-upload.js";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

const mockedGetSignedUrl = vi.mocked(getSignedUrl);
const mockedRandomUUID = vi.mocked(randomUUID);

function makeEvent(body: unknown): APIGatewayProxyEventV2 {
  return {
    routeKey: "POST /api/items/upload-url",
    body: typeof body === "string" ? body : JSON.stringify(body),
  } as APIGatewayProxyEventV2;
}

describe("POST /api/items/upload-url", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedRandomUUID
      .mockReturnValueOnce("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
      .mockReturnValueOnce("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb");
  });

  it("returns presigned URL and s3Key for valid JPEG request", async () => {
    mockedGetSignedUrl.mockResolvedValueOnce(
      "https://test-bucket.s3.amazonaws.com/presigned-url",
    );

    const response = await presignUpload(
      makeEvent({ filename: "photo.jpg", contentType: "image/jpeg" }),
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.uploadUrl).toBe(
      "https://test-bucket.s3.amazonaws.com/presigned-url",
    );
    expect(body.s3Key).toMatch(/^items\/[a-f0-9-]+\/[a-f0-9-]+\.jpg$/);
  });

  it("returns presigned URL and s3Key for valid PNG request", async () => {
    mockedGetSignedUrl.mockResolvedValueOnce(
      "https://test-bucket.s3.amazonaws.com/presigned-url",
    );

    const response = await presignUpload(
      makeEvent({ filename: "image.png", contentType: "image/png" }),
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.s3Key).toMatch(/\.png$/);
  });

  it("returns presigned URL and s3Key for valid WebP request", async () => {
    mockedGetSignedUrl.mockResolvedValueOnce(
      "https://test-bucket.s3.amazonaws.com/presigned-url",
    );

    const response = await presignUpload(
      makeEvent({ filename: "image.webp", contentType: "image/webp" }),
    );

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body as string);
    expect(body.s3Key).toMatch(/\.webp$/);
  });

  it("returns 400 for invalid content type", async () => {
    const response = await presignUpload(
      makeEvent({ filename: "doc.pdf", contentType: "application/pdf" }),
    );

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe("validation_error");
    expect(body.fields[0].field).toBe("contentType");
  });

  it("returns 400 for missing filename", async () => {
    const response = await presignUpload(
      makeEvent({ contentType: "image/jpeg" }),
    );

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body as string).error).toBe("validation_error");
  });

  it("returns 400 for missing contentType", async () => {
    const response = await presignUpload(makeEvent({ filename: "photo.jpg" }));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body as string).error).toBe("validation_error");
  });

  it("returns 400 for empty filename", async () => {
    const response = await presignUpload(
      makeEvent({ filename: "", contentType: "image/jpeg" }),
    );

    expect(response.statusCode).toBe(400);
    const body = JSON.parse(response.body as string);
    expect(body.error).toBe("validation_error");
    expect(body.fields[0].field).toBe("filename");
  });

  it("returns 400 for invalid JSON body", async () => {
    const response = await presignUpload(makeEvent("not-json{{{"));

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body as string).error).toBe("invalid_json");
  });

  it("returns 500 when S3 presign fails", async () => {
    mockedGetSignedUrl.mockRejectedValueOnce(new Error("S3 error"));

    const response = await presignUpload(
      makeEvent({ filename: "photo.jpg", contentType: "image/jpeg" }),
    );

    expect(response.statusCode).toBe(500);
    expect(JSON.parse(response.body as string)).toEqual({
      error: "internal_error",
    });
  });
});
