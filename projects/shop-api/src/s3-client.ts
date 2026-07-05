import { S3Client } from "@aws-sdk/client-s3";

export const s3Client: S3Client = new S3Client({});

export const BUCKET_NAME: string = process.env.BUCKET_NAME ?? "";
