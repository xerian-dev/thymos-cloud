import { describe, it, expect } from "vitest";
import { jsonResponse, textResponse, errorResponse } from "../src/response.js";

describe("response helpers", () => {
  describe("jsonResponse", () => {
    it("returns the correct status code", () => {
      const result = jsonResponse(200, { ok: true });
      expect(result.statusCode).toBe(200);
    });

    it("sets Content-Type to application/json", () => {
      const result = jsonResponse(200, { ok: true });
      expect(result.headers).toEqual({ "Content-Type": "application/json" });
    });

    it("serializes the body as JSON", () => {
      const body = { accounts: [{ name: "Alice" }] };
      const result = jsonResponse(200, body);
      expect(result.body).toBe(JSON.stringify(body));
    });

    it("handles null body", () => {
      const result = jsonResponse(204, null);
      expect(result.body).toBe("null");
    });

    it("handles array body", () => {
      const result = jsonResponse(200, [1, 2, 3]);
      expect(result.body).toBe("[1,2,3]");
    });
  });

  describe("textResponse", () => {
    it("returns the correct status code", () => {
      const result = textResponse(409, "duplicate");
      expect(result.statusCode).toBe(409);
    });

    it("sets Content-Type to text/plain", () => {
      const result = textResponse(200, "ok");
      expect(result.headers).toEqual({ "Content-Type": "text/plain" });
    });

    it("returns the body as-is without serialization", () => {
      const result = textResponse(422, "max_reached");
      expect(result.body).toBe("max_reached");
    });
  });

  describe("errorResponse", () => {
    it("returns status code 500", () => {
      const result = errorResponse();
      expect(result.statusCode).toBe(500);
    });

    it("sets Content-Type to application/json", () => {
      const result = errorResponse();
      expect(result.headers).toEqual({ "Content-Type": "application/json" });
    });

    it("returns body with error internal_error", () => {
      const result = errorResponse();
      expect(result.body).toBe(JSON.stringify({ error: "internal_error" }));
    });
  });
});
