import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { deriveImportTags } from "../field-mapper";

/**
 * Property 5: Email notification tag assignment
 * Validates: Requirements 8.1, 8.2
 *
 * For any boolean emailNotificationsEnabled and any normalized phone string,
 * the `email_notification` tag is present in tags if and only if enabled is true.
 */
describe("Property 5: Email notification tag assignment", () => {
  it("includes email_notification tag when emailNotificationsEnabled is true", () => {
    fc.assert(
      fc.property(fc.string(), (phone) => {
        const tags = deriveImportTags(true, phone);
        expect(tags).toContain("email_notification");
      }),
      { numRuns: 100 },
    );
  });

  it("does not include email_notification tag when emailNotificationsEnabled is false", () => {
    fc.assert(
      fc.property(fc.string(), (phone) => {
        const tags = deriveImportTags(false, phone);
        expect(tags).not.toContain("email_notification");
      }),
      { numRuns: 100 },
    );
  });

  it("email_notification is in tags iff emailNotificationsEnabled is true", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.string(), (enabled, phone) => {
        const tags = deriveImportTags(enabled, phone);
        if (enabled) {
          expect(tags).toContain("email_notification");
        } else {
          expect(tags).not.toContain("email_notification");
        }
      }),
      { numRuns: 100 },
    );
  });
});
