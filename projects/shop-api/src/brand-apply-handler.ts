/**
 * Brand apply Lambda handler.
 *
 * Applies brand mapping delta to DynamoDB items. Long-running operation
 * invoked asynchronously by the shop-api POST /api/brands/apply route.
 */

import { handler } from "./brands/apply-mappings.js";

export { handler };
