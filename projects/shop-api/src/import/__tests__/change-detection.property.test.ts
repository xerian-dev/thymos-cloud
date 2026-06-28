import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { hasFieldChanges } from "../field-mapper";
import type {
  ExistingAccountFields,
  MappedAccountFields,
} from "../field-mapper";

/**
 * Property 7: Change detection covers all fields and tags
 *
 * For any pair of existing/mapped fields, verify `hasFieldChanges` returns true
 * when any single field or tags differ, and false when all equal.
 *
 * **Validates: Requirements 9.6**
 */

const mappedFieldsArb: fc.Arbitrary<MappedAccountFields> = fc.record({
  name: fc.string({ minLength: 1 }),
  company: fc.string(),
  street: fc.string(),
  place: fc.string(),
  postcode: fc.string(),
  canton: fc.string(),
  email: fc.string(),
  telephone: fc.string(),
  tags: fc.array(fc.string({ minLength: 1 }), { maxLength: 5 }),
});

const scalarFields = [
  "name",
  "company",
  "street",
  "place",
  "postcode",
  "canton",
  "email",
  "telephone",
] as const;

describe("Property 7: Change detection covers all fields and tags", () => {
  it("returns false when all fields and tags are equal", () => {
    fc.assert(
      fc.property(mappedFieldsArb, (mapped) => {
        const existing: ExistingAccountFields = {
          ...mapped,
          tags: [...mapped.tags],
        };
        expect(hasFieldChanges(existing, mapped)).toBe(false);
      }),
    );
  });

  for (const field of scalarFields) {
    it(`returns true when ${field} differs`, () => {
      fc.assert(
        fc.property(
          mappedFieldsArb,
          fc.string({ minLength: 1 }),
          (mapped, differentValue) => {
            fc.pre(differentValue !== mapped[field]);
            const existing: ExistingAccountFields = {
              ...mapped,
              tags: [...mapped.tags],
              [field]: differentValue,
            };
            expect(hasFieldChanges(existing, mapped)).toBe(true);
          },
        ),
      );
    });
  }

  it("returns true when tags differ in content", () => {
    fc.assert(
      fc.property(
        mappedFieldsArb,
        fc.array(fc.string({ minLength: 1 }), { minLength: 1, maxLength: 5 }),
        (mapped, differentTags) => {
          const sortedMapped = [...mapped.tags].sort();
          const sortedDiff = [...differentTags].sort();
          fc.pre(JSON.stringify(sortedMapped) !== JSON.stringify(sortedDiff));
          const existing: ExistingAccountFields = {
            ...mapped,
            tags: differentTags,
          };
          expect(hasFieldChanges(existing, mapped)).toBe(true);
        },
      ),
    );
  });

  it("returns true when tags differ in length", () => {
    fc.assert(
      fc.property(
        mappedFieldsArb,
        fc.string({ minLength: 1 }),
        (mapped, extraTag) => {
          const longerTags = [...mapped.tags, extraTag];
          const existing: ExistingAccountFields = {
            ...mapped,
            tags: longerTags,
          };
          expect(hasFieldChanges(existing, mapped)).toBe(true);
        },
      ),
    );
  });
});
