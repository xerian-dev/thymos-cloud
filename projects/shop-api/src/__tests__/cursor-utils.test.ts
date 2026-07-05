import { describe, it, expect } from "vitest";
import { encodeCursor, decodeCursor } from "../cursor-utils.js";

describe("cursor-utils", () => {
  describe("encodeCursor", () => {
    it("encodes a LastEvaluatedKey as a base64url string", () => {
      const key = {
        PK: "ACCOUNT#abc-123",
        SK: "METADATA",
        GSI1PK: "ACCOUNT",
        GSI1SK: "0000042",
      };

      const cursor = encodeCursor(key);

      expect(typeof cursor).toBe("string");
      expect(cursor.length).toBeGreaterThan(0);
      // base64url should not contain +, /, or = padding
      expect(cursor).not.toMatch(/[+/=]/);
    });

    it("produces different cursors for different keys", () => {
      const key1 = {
        PK: "ACCOUNT#aaa",
        SK: "METADATA",
        GSI1PK: "ACCOUNT",
        GSI1SK: "0000001",
      };
      const key2 = {
        PK: "ACCOUNT#bbb",
        SK: "METADATA",
        GSI1PK: "ACCOUNT",
        GSI1SK: "0000002",
      };

      expect(encodeCursor(key1)).not.toBe(encodeCursor(key2));
    });
  });

  describe("decodeCursor", () => {
    it("decodes a valid cursor back to the original key", () => {
      const key = {
        PK: "ACCOUNT#abc-123",
        SK: "METADATA",
        GSI1PK: "ACCOUNT",
        GSI1SK: "0000042",
      };

      const cursor = encodeCursor(key);
      const decoded = decodeCursor(cursor);

      expect(decoded).toStrictEqual(key);
    });

    it("throws for an invalid base64url string that decodes to non-JSON", () => {
      // "not-json" in base64url is just a string, not valid JSON
      const invalidCursor =
        Buffer.from("not valid json {{{").toString("base64url");

      expect(() => decodeCursor(invalidCursor)).toThrow("Invalid cursor");
    });

    it("throws for a cursor that decodes to a JSON array", () => {
      const arrayCursor = Buffer.from(JSON.stringify([1, 2, 3])).toString(
        "base64url",
      );

      expect(() => decodeCursor(arrayCursor)).toThrow(
        "Invalid cursor: decoded value is not a JSON object",
      );
    });

    it("throws for a cursor that decodes to a JSON primitive", () => {
      const primitiveCursor = Buffer.from(JSON.stringify("hello")).toString(
        "base64url",
      );

      expect(() => decodeCursor(primitiveCursor)).toThrow(
        "Invalid cursor: decoded value is not a JSON object",
      );
    });

    it("throws for a cursor that decodes to null", () => {
      const nullCursor = Buffer.from(JSON.stringify(null)).toString(
        "base64url",
      );

      expect(() => decodeCursor(nullCursor)).toThrow(
        "Invalid cursor: decoded value is not a JSON object",
      );
    });

    it("throws for a completely invalid string", () => {
      // This will decode from base64url to gibberish that isn't valid JSON
      expect(() => decodeCursor("!!!not-base64url-at-all!!!")).toThrow(
        "Invalid cursor",
      );
    });
  });

  describe("round-trip", () => {
    it("encode then decode returns the original key", () => {
      const key = {
        PK: "ACCOUNT#550e8400-e29b-41d4-a716-446655440000",
        SK: "METADATA",
        GSI1PK: "ACCOUNT",
        GSI1SK: "0000099",
      };

      expect(decodeCursor(encodeCursor(key))).toStrictEqual(key);
    });
  });
});
