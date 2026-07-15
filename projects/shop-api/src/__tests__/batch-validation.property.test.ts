import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { validateBatchRequest } from "../routes/batch-get-employees";

/**
 * **Validates: Requirements 7.5, 7.7**
 */
describe("Feature: sales-backend-api, Property 7: Batch request validation", () => {
  it("accepts any object with a uuids array of length 0-100", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 0, maxLength: 100 }),
        (uuids) => {
          const result = validateBatchRequest({ uuids });
          expect(result.valid).toBe(true);
          if (result.valid) {
            expect(result.uuids).toEqual(uuids);
          }
        },
      ),
      { numRuns: 200 },
    );
  });

  it("rejects arrays exceeding 100 items with 'too_many_uuids'", () => {
    fc.assert(
      fc.property(
        fc.array(fc.uuid(), { minLength: 101, maxLength: 200 }),
        (uuids) => {
          const result = validateBatchRequest({ uuids });
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe("too_many_uuids");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when uuids is not an array with 'validation_error'", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
        ),
        (badUuids) => {
          const result = validateBatchRequest({ uuids: badUuids });
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe("validation_error");
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it("rejects when uuids field is missing with 'validation_error'", () => {
    fc.assert(
      fc.property(fc.record({ notUuids: fc.string() }), (body) => {
        const result = validateBatchRequest(body);
        expect(result.valid).toBe(false);
        if (!result.valid) {
          expect(result.error).toBe("validation_error");
        }
      }),
      { numRuns: 100 },
    );
  });

  it("rejects non-object bodies with 'validation_error'", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.integer(),
          fc.boolean(),
          fc.constant(null),
          fc.constant(undefined),
        ),
        (body) => {
          const result = validateBatchRequest(body);
          expect(result.valid).toBe(false);
          if (!result.valid) {
            expect(result.error).toBe("validation_error");
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
