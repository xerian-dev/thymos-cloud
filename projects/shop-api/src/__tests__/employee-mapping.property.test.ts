import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { mapEmployeeRecord } from "../routes/get-employee";

/**
 * **Validates: Requirements 6.2, 7.2**
 *
 * Property 6: Employee response mapping
 * For any DynamoDB employee record containing arbitrary additional attributes
 * (PK, SK, GSI keys, etc.), the response mapper extracts exactly `uuid`, `name`,
 * `sourceId`, `createdAt`, and `updatedAt` — no DynamoDB key attributes leak
 * into the API response.
 */

// Generator for a DynamoDB employee record with extra DynamoDB attributes
const dynamoEmployeeArb = fc.record({
  PK: fc.constant("EMPLOYEE#some-uuid"),
  SK: fc.constant("METADATA"),
  GSI1PK: fc.constant("EMPLOYEES"),
  GSI1SK: fc.string(),
  uuid: fc.uuid(),
  name: fc.string({ minLength: 1 }),
  sourceId: fc.string({ minLength: 1 }),
  createdAt: fc
    .integer({ min: 946684800000, max: 4102444800000 })
    .map((ms) => new Date(ms).toISOString()),
  updatedAt: fc
    .integer({ min: 946684800000, max: 4102444800000 })
    .map((ms) => new Date(ms).toISOString()),
  // Extra random attributes that should NOT leak
  randomField1: fc.string(),
  randomField2: fc.integer(),
});

describe("Feature: sales-backend-api, Property 6: Employee response mapping", () => {
  it("extracts exactly uuid, name, sourceId, createdAt, updatedAt", () => {
    fc.assert(
      fc.property(dynamoEmployeeArb, (record) => {
        const result = mapEmployeeRecord(record as Record<string, unknown>);
        const keys = Object.keys(result);
        expect(keys).toHaveLength(5);
        expect(keys.sort()).toEqual([
          "createdAt",
          "name",
          "sourceId",
          "updatedAt",
          "uuid",
        ]);
      }),
      { numRuns: 200 },
    );
  });

  it("maps values correctly from the source record", () => {
    fc.assert(
      fc.property(dynamoEmployeeArb, (record) => {
        const result = mapEmployeeRecord(record as Record<string, unknown>);
        expect(result.uuid).toBe(record.uuid);
        expect(result.name).toBe(record.name);
        expect(result.sourceId).toBe(record.sourceId);
        expect(result.createdAt).toBe(record.createdAt);
        expect(result.updatedAt).toBe(record.updatedAt);
      }),
      { numRuns: 200 },
    );
  });

  it("never leaks PK, SK, GSI1PK, or GSI1SK attributes", () => {
    fc.assert(
      fc.property(dynamoEmployeeArb, (record) => {
        const result = mapEmployeeRecord(record as Record<string, unknown>);
        const resultObj = result as Record<string, unknown>;
        expect(resultObj.PK).toBeUndefined();
        expect(resultObj.SK).toBeUndefined();
        expect(resultObj.GSI1PK).toBeUndefined();
        expect(resultObj.GSI1SK).toBeUndefined();
      }),
      { numRuns: 200 },
    );
  });
});
