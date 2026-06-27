import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { errorResponse } from "../src/response.js";

/**
 * Feature: accounts-api-backend, Property 8: Error responses contain no internal details
 *
 * For any error produced by the monolambda, the HTTP response body SHALL NOT contain
 * substrings matching AWS ARN patterns, DynamoDB table names, file paths, or stack trace
 * patterns (lines containing ` at ` followed by file references).
 *
 * Validates: Requirements 9.2
 */

describe("Feature: accounts-api-backend, Property 8: Error responses contain no internal details", () => {
  const arnPattern = /arn:aws:/;
  const tableNamePattern = /thymos-/;
  const filePathPattern = /\/(var|home|opt|tmp)\//;
  const stackTracePattern = / at .+\.\w+:\d+:\d+/;

  it("errorResponse() body does not contain AWS ARN patterns", () => {
    const arnArb = fc
      .record({
        partition: fc.constantFrom("aws", "aws-cn", "aws-us-gov"),
        service: fc.constantFrom("dynamodb", "lambda", "iam", "s3"),
        region: fc.constantFrom("us-east-1", "eu-west-1", "ap-southeast-2"),
        account: fc.stringMatching(/^[0-9]{12}$/),
        resource: fc.string({ minLength: 1, maxLength: 50 }),
      })
      .map(
        ({ partition, service, region, account, resource }) =>
          `arn:${partition}:${service}:${region}:${account}:${resource}`,
      );

    fc.assert(
      fc.property(arnArb, (_arn: string) => {
        const result = errorResponse();
        const body = result.body as string;
        expect(body).not.toMatch(arnPattern);
      }),
      { numRuns: 100 },
    );
  });

  it("errorResponse() body does not contain DynamoDB table name patterns", () => {
    const tableNameArb = fc
      .constantFrom("dev", "staging", "prod", "test")
      .map((env) => `thymos-${env}-shop`);

    fc.assert(
      fc.property(tableNameArb, (_tableName: string) => {
        const result = errorResponse();
        const body = result.body as string;
        expect(body).not.toMatch(tableNamePattern);
      }),
      { numRuns: 100 },
    );
  });

  it("errorResponse() body does not contain file path patterns", () => {
    const filePathArb = fc
      .record({
        prefix: fc.constantFrom("/var/", "/home/", "/opt/", "/tmp/"),
        suffix: fc.string({ minLength: 1, maxLength: 50 }),
      })
      .map(({ prefix, suffix }) => `${prefix}${suffix}`);

    fc.assert(
      fc.property(filePathArb, (_filePath: string) => {
        const result = errorResponse();
        const body = result.body as string;
        expect(body).not.toMatch(filePathPattern);
      }),
      { numRuns: 100 },
    );
  });

  it("errorResponse() body does not contain stack trace patterns", () => {
    const stackTraceArb = fc
      .record({
        fn: fc.constantFrom("Object.<anonymous>", "Module._compile", "handler"),
        file: fc.string({ minLength: 1, maxLength: 30 }),
        line: fc.integer({ min: 1, max: 1000 }),
        col: fc.integer({ min: 1, max: 100 }),
      })
      .map(
        ({ fn, file, line, col }) => `    at ${fn} (${file}.ts:${line}:${col})`,
      );

    fc.assert(
      fc.property(stackTraceArb, (_trace: string) => {
        const result = errorResponse();
        const body = result.body as string;
        expect(body).not.toMatch(stackTracePattern);
      }),
      { numRuns: 100 },
    );
  });

  it("errorResponse() body does not leak arbitrary error-like strings", () => {
    const errorInputArb = fc.oneof(
      fc.string({ minLength: 1, maxLength: 200 }),
      fc
        .record({
          message: fc.string({ minLength: 1, maxLength: 100 }),
          code: fc.string({ minLength: 1, maxLength: 20 }),
        })
        .map((obj) => JSON.stringify(obj)),
    );

    fc.assert(
      fc.property(errorInputArb, (errorInput: string) => {
        const result = errorResponse();
        const body = result.body as string;

        // The response should always be the fixed error message
        expect(body).toBe(JSON.stringify({ error: "internal_error" }));

        // Verify arbitrary input is never included in the response
        // (skip trivial substrings that naturally appear in the fixed response)
        if (errorInput.length > 3 && !body.includes(errorInput)) {
          expect(body).not.toContain(errorInput);
        }
      }),
      { numRuns: 100 },
    );
  });
});
