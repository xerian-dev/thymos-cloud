/**
 * Cursor encoding/decoding utilities for DynamoDB cursor-based pagination.
 *
 * A cursor is a base64url-encoded JSON representation of a DynamoDB
 * LastEvaluatedKey. It is treated as an opaque token by clients.
 */

/**
 * Encodes a DynamoDB LastEvaluatedKey as an opaque base64url cursor string.
 */
export function encodeCursor(
  lastEvaluatedKey: Record<string, unknown>,
): string {
  return Buffer.from(JSON.stringify(lastEvaluatedKey)).toString("base64url");
}

/**
 * Decodes a base64url cursor string back into a DynamoDB ExclusiveStartKey object.
 *
 * @throws {Error} If the cursor is not valid base64url or does not contain valid JSON.
 */
export function decodeCursor(cursor: string): Record<string, unknown> {
  let json: string;
  try {
    json = Buffer.from(cursor, "base64url").toString("utf-8");
  } catch {
    throw new Error("Invalid cursor: not valid base64url");
  }

  try {
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      throw new Error("Invalid cursor: decoded value is not a JSON object");
    }
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("Invalid cursor: not valid JSON");
    }
    throw error;
  }
}
