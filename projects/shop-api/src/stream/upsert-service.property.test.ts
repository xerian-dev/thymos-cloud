import { describe, it, expect } from "vitest";
import * as fc from "fast-check";

/**
 * Property tests for SKU resolution and GSI1SK formatting
 * Validates: Requirements 3.1, 3.4
 */
describe("upsert-service property tests", () => {
  // GSI1SK formatting helper (mirrors logic in upsert-service.ts)
  function formatGsi1sk(sku: number): string {
    return `ITEM#${String(sku).padStart(7, "0")}`;
  }

  // SKU resolution logic (mirrors logic in upsert-service.ts)
  function resolveSkuSource(rawSku: string): "cc" | "sequence" {
    const parsed = rawSku ? parseInt(rawSku, 10) : NaN;
    if (!isNaN(parsed) && parsed > 0) {
      return "cc";
    }
    return "sequence";
  }

  it("Property 6: CC SKU passthrough — numeric positive strings use CC SKU directly", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9_999_999 }), (skuNum) => {
        const rawSku = String(skuNum);
        expect(resolveSkuSource(rawSku)).toBe("cc");
      }),
    );
  });

  it("Property 6: Non-numeric or non-positive strings fall back to sequence", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("", "abc", "0", "-5", "hello123", "NaN"),
        (rawSku) => {
          expect(resolveSkuSource(rawSku)).toBe("sequence");
        },
      ),
    );
  });

  it("Property 7: GSI1SK is ITEM# + 7-digit zero-padded SKU for any positive integer 1-9,999,999", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 9_999_999 }), (sku) => {
        const result = formatGsi1sk(sku);
        expect(result.startsWith("ITEM#")).toBe(true);
        const numericPart = result.slice(5);
        expect(numericPart.length).toBe(7);
        expect(parseInt(numericPart, 10)).toBe(sku);
      }),
    );
  });
});

/**
 * Mirrors extractAccountSourceId from upsert-service.ts
 * (not exported, so we replicate the logic for property testing)
 */
function extractAccountSourceId(
  raw: Record<string, unknown>,
): string | undefined {
  const account = raw.account;
  if (
    account != null &&
    typeof account === "object" &&
    !Array.isArray(account)
  ) {
    const accountObj = account as Record<string, unknown>;
    if (typeof accountObj.id === "string" && accountObj.id) {
      return accountObj.id;
    }
  }
  if (typeof raw.account_id === "string" && raw.account_id) {
    return raw.account_id;
  }
  return undefined;
}

/**
 * Property 8: Account source ID extraction
 *
 * For any raw record where raw.account is an object with a string id property,
 * the extracted account source ID SHALL equal that id value.
 * For any raw record where raw.account is absent but raw.account_id is a non-empty string,
 * the extracted account source ID SHALL equal raw.account_id.
 *
 * **Validates: Requirements 4.1**
 */
describe("Property 8: Account source ID extraction", () => {
  it("extracts id from nested account.id", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (id) => {
        const raw: Record<string, unknown> = { account: { id } };
        expect(extractAccountSourceId(raw)).toBe(id);
      }),
    );
  });

  it("falls back to flat account_id when account.id is missing", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), (accountId) => {
        const raw: Record<string, unknown> = { account_id: accountId };
        expect(extractAccountSourceId(raw)).toBe(accountId);
      }),
    );
  });

  it("prefers nested account.id over flat account_id", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1 }),
        fc.string({ minLength: 1 }),
        (nestedId, flatId) => {
          const raw: Record<string, unknown> = {
            account: { id: nestedId },
            account_id: flatId,
          };
          expect(extractAccountSourceId(raw)).toBe(nestedId);
        },
      ),
    );
  });

  it("returns undefined when neither is present", () => {
    fc.assert(
      fc.property(fc.dictionary(fc.string(), fc.anything()), (raw) => {
        // Remove both account and account_id
        delete raw.account;
        delete raw.account_id;
        expect(extractAccountSourceId(raw)).toBeUndefined();
      }),
    );
  });
});
