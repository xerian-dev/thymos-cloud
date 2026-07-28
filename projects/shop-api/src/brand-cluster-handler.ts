/**
 * Brand scan & cluster Lambda handler.
 *
 * Scans DynamoDB for all distinct brand values, clusters them using
 * Levenshtein distance, and writes the draft mapping to S3.
 *
 * Invoked asynchronously by the shop-api POST /api/brands/scan-cluster route.
 */

import { handler } from "./brands/scan-cluster.js";

export { handler };
