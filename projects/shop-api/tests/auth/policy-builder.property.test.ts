import { describe, it, expect } from "vitest";
import fc from "fast-check";
import { buildPolicy } from "../../src/auth/policy-builder.js";

/**
 * Validates: Requirements 5.1, 5.2, 5.3, 5.4
 */
describe("Feature: accounts-api-backend, Property 6: Authorization group-to-policy mapping", () => {
  it("returns isAuthorized true with admin context when groups contain admin", () => {
    fc.assert(
      fc.property(
        fc
          .array(fc.string({ minLength: 1, maxLength: 20 }))
          .map((groups) => [...groups, "admin"]),
        (groups) => {
          const result = buildPolicy(groups);
          expect(result.isAuthorized).toBe(true);
          expect(result.context?.groups).toBe("admin");
        },
      ),
    );
  });

  it("returns isAuthorized true with readonly context when groups contain readonly but not admin", () => {
    fc.assert(
      fc.property(
        fc
          .array(
            fc
              .string({ minLength: 1, maxLength: 20 })
              .filter((s) => s !== "admin" && s !== "readonly"),
          )
          .map((groups) => [...groups, "readonly"]),
        (groups) => {
          const result = buildPolicy(groups);
          expect(result.isAuthorized).toBe(true);
          expect(result.context?.groups).toBe("readonly");
        },
      ),
    );
  });

  it("returns isAuthorized false when groups contain neither admin nor readonly", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc
            .string({ minLength: 1, maxLength: 20 })
            .filter((s) => s !== "admin" && s !== "readonly"),
        ),
        (groups) => {
          const result = buildPolicy(groups);
          expect(result.isAuthorized).toBe(false);
        },
      ),
    );
  });
});
