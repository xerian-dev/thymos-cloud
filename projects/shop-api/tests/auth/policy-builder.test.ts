import { describe, it, expect } from "vitest";
import { buildPolicy } from "../../src/auth/policy-builder";

describe("policy-builder", () => {
  describe("buildPolicy", () => {
    it("returns isAuthorized true with admin context for admin group", () => {
      const result = buildPolicy(["admin"]);
      expect(result).toEqual({
        isAuthorized: true,
        context: { groups: "admin" },
      });
    });

    it("returns isAuthorized true with readonly context for readonly group", () => {
      const result = buildPolicy(["readonly"]);
      expect(result).toEqual({
        isAuthorized: true,
        context: { groups: "readonly" },
      });
    });

    it("returns admin when both admin and readonly are present", () => {
      const result = buildPolicy(["admin", "readonly"]);
      expect(result).toEqual({
        isAuthorized: true,
        context: { groups: "admin" },
      });
    });

    it("returns isAuthorized false for empty groups array", () => {
      const result = buildPolicy([]);
      expect(result).toEqual({ isAuthorized: false, context: { groups: "" } });
    });

    it("returns isAuthorized false for unrecognized groups", () => {
      const result = buildPolicy(["editor"]);
      expect(result).toEqual({ isAuthorized: false, context: { groups: "" } });
    });
  });
});
