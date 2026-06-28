import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { deriveImportTags } from "../field-mapper";

/**
 * Feature: account-model-restructure, Property 6: Text notification tag assignment
 * Validates: Requirements 8.3, 8.4
 */
describe("Property 6: Text notification tag assignment", () => {
  it("includes text_notification when phone starts with 079, 078, or 077", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom("079", "078", "077"),
        fc.string({ minLength: 0, maxLength: 20 }),
        (enabled, prefix, suffix) => {
          const tags = deriveImportTags(enabled, prefix + suffix);
          expect(tags).toContain("text_notification");
        },
      ),
      { numRuns: 200 },
    );
  });

  it("does not include text_notification for non-mobile prefixes", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc
          .string({ minLength: 0, maxLength: 30 })
          .filter(
            (s) =>
              !s.startsWith("079") &&
              !s.startsWith("078") &&
              !s.startsWith("077"),
          ),
        (enabled, phone) => {
          const tags = deriveImportTags(enabled, phone);
          expect(tags).not.toContain("text_notification");
        },
      ),
      { numRuns: 200 },
    );
  });
});
