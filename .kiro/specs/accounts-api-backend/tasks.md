# Implementation Plan: Accounts API Backend

## Overview

This plan implements the accounts API backend as a monolambda + Lambda authorizer served behind an API Gateway HTTP API. The implementation is organized to maximize parallelism: project scaffolding first, then shared utilities and authorizer modules in parallel, followed by route handlers, the monolambda entry point, and Terraform infrastructure (which can proceed independently of Lambda code).

## Tasks

- [x] 1. Scaffold shop-api project
  - [x] 1.1 Create project configuration files
    - Create `/projects/shop-api/package.json` with dependencies (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`, `jose`) and dev dependencies (`typescript`, `esbuild`, `vitest`, `fast-check`, `@types/aws-lambda`, `eslint`)
    - Create `/projects/shop-api/tsconfig.json` with strict mode enabled, ESM module, Node20 target
    - Create `/projects/shop-api/esbuild.config.mjs` with two entry points (`src/handler.ts`, `src/authorizer.ts`), target `node20`, platform `node`, format `esm`, bundle `true`, external `@aws-sdk/*`, output to `dist/`
    - Create directory structure: `src/`, `src/routes/`, `src/auth/`, `tests/`, `tests/routes/`, `tests/auth/`
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [x] 2. Implement shared utilities
  - [x] 2.1 Implement PK utilities module
    - Create `/projects/shop-api/src/pk-utils.ts`
    - Implement `buildAccountPk(accountNumber: number): string` — constructs `ACCOUNT#` + 7-digit zero-padded number
    - Implement `parseAccountPk(pk: string): number` — strips prefix and parses integer
    - Implement `formatAccountNumber(accountNumber: number): string` — 7-digit zero-pad
    - _Requirements: 1.2, 3.3_

  - [x] 2.2 Write property test for PK utilities
    - **Property 1: Account PK round-trip**
    - For any integer N in [1, 9999999], `parseAccountPk(buildAccountPk(N))` produces N and the PK matches `ACCOUNT#` followed by exactly 7 digits
    - Create `/projects/shop-api/tests/pk-utils.property.test.ts`
    - **Validates: Requirements 1.2, 3.3**

  - [x] 2.3 Write unit tests for PK utilities
    - Create `/projects/shop-api/tests/pk-utils.test.ts`
    - Test specific examples: buildAccountPk(1) → `ACCOUNT#0000001`, parseAccountPk(`ACCOUNT#0000042`) → 42
    - Test edge cases: 1, 9999999
    - _Requirements: 1.2, 3.3_

  - [x] 2.4 Implement response helpers module
    - Create `/projects/shop-api/src/response.ts`
    - Implement `jsonResponse(statusCode, body)` — returns APIGatewayProxyResultV2 with JSON Content-Type
    - Implement `textResponse(statusCode, body)` — returns APIGatewayProxyResultV2 with text Content-Type
    - Implement `errorResponse()` — returns 500 with `{ error: "internal_error" }`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x] 2.5 Write property test for response helpers
    - **Property 8: Error responses contain no internal details**
    - For any error input, the response body does not contain AWS ARN patterns, DynamoDB table names, file paths, or stack trace patterns
    - Create `/projects/shop-api/tests/response.property.test.ts`
    - **Validates: Requirements 9.2**

  - [x] 2.6 Implement validation module
    - Create `/projects/shop-api/src/validation.ts`
    - Implement `validateCreateAccount(body: unknown): ValidationResult`
    - Validate `accountNumber`: integer, 1 ≤ n ≤ 9999999
    - Validate `name`: non-empty string, max 100 chars, at least one non-whitespace character
    - Validate `address`: string, max 500 chars (optional — empty string allowed)
    - Validate `telephone`: string, max 30 chars (optional — empty string allowed)
    - Return structured ValidationError[] on failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.7 Write property tests for validation module
    - **Property 3: Account number validation** — accepts value iff integer in [1, 9999999]
    - **Property 4: Name validation** — accepts string iff length 1–100 with at least one non-whitespace character
    - **Property 5: Optional field length validation** — accepts string iff length ≤ max (500 for address, 30 for telephone)
    - Create `/projects/shop-api/tests/validation.property.test.ts`
    - **Validates: Requirements 4.1, 4.2, 4.3, 4.4**

  - [x] 2.8 Write unit tests for validation module
    - Create `/projects/shop-api/tests/validation.test.ts`
    - Test: missing required fields returns errors
    - Test: non-integer accountNumber rejected
    - Test: accountNumber 0 and 10000000 rejected
    - Test: name with only whitespace rejected
    - Test: valid input accepted
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 2.9 Implement DynamoDB client module
    - Create `/projects/shop-api/src/dynamodb-client.ts`
    - Export shared DynamoDBDocumentClient instance configured from environment variable `TABLE_NAME`
    - Use `@aws-sdk/lib-dynamodb` DynamoDBDocumentClient with marshalling options
    - _Requirements: 1.1, 2.1, 3.1_

- [x] 3. Implement Lambda authorizer
  - [x] 3.1 Implement JWKS client
    - Create `/projects/shop-api/src/auth/jwks-client.ts`
    - Fetch JWKS from Cognito endpoint (`https://cognito-idp.{region}.amazonaws.com/{userPoolId}/.well-known/jwks.json`)
    - Cache JWKS at module level (persists across warm invocations)
    - Export function to get signing key by `kid`
    - _Requirements: 5.5_

  - [x] 3.2 Implement JWT validator
    - Create `/projects/shop-api/src/auth/jwt-validator.ts`
    - Decode JWT header to extract `kid`
    - Verify signature using JWKS key via `jose` library
    - Validate `iss` claim matches Cognito User Pool URL
    - Validate `token_use` claim equals `access`
    - Validate token is not expired
    - Extract and return `cognito:groups` claim
    - Return null/error for any validation failure
    - _Requirements: 5.5, 5.6, 5.7_

  - [x] 3.3 Implement policy builder
    - Create `/projects/shop-api/src/auth/policy-builder.ts`
    - Implement function that takes group claims array and request context
    - If groups contain `admin` → return `{ isAuthorized: true, context: { groups: "admin" } }`
    - If groups contain `readonly` (not `admin`) → return `{ isAuthorized: true, context: { groups: "readonly" } }`
    - If neither → return `{ isAuthorized: false }`
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

  - [x] 3.4 Write property test for policy builder
    - **Property 6: Authorization group-to-policy mapping**
    - For any set of group claims: admin → isAuthorized true; readonly without admin → isAuthorized true with read-only context; neither → isAuthorized false
    - Create `/projects/shop-api/tests/auth/policy-builder.property.test.ts`
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4**

  - [x] 3.5 Write unit tests for authorizer modules
    - Create `/projects/shop-api/tests/auth/jwt-validator.test.ts`
    - Create `/projects/shop-api/tests/auth/policy-builder.test.ts`
    - Test: expired token returns deny
    - Test: missing Authorization header returns deny
    - Test: invalid issuer returns deny
    - Test: admin group gets full access
    - Test: readonly group gets read-only access
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 3.6 Implement authorizer entry point
    - Create `/projects/shop-api/src/authorizer.ts`
    - Export `handler(event: APIGatewayRequestAuthorizerEventV2): Promise<APIGatewaySimpleAuthorizerResult>`
    - Extract Bearer token from Authorization header
    - Call jwt-validator to validate token and extract groups
    - Call policy-builder to produce authorization response
    - Return deny for any error (no internal details exposed)
    - _Requirements: 5.1, 5.4, 5.5, 5.6, 5.7_

- [x] 4. Implement route handlers
  - [x] 4.1 Implement list-accounts route handler
    - Create `/projects/shop-api/src/routes/list-accounts.ts`
    - Scan Shop_Table with FilterExpression `SK = :metadata`
    - For each account, query comments (SK begins_with `COMMENT#`) and count results
    - For each account, query tags (SK begins_with `TAG#`) and extract labels
    - Map Account_Items to response shape with `uuid`, `shopUid`, `name`, `address`, `telephone`, `commentCount`, `tags`
    - Return 200 with `{ accounts: [...] }`, empty array if no accounts
    - Return 500 with `{ error: "internal_error" }` on DynamoDB failure
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.1, 10.2, 10.3, 10.4_

  - [x] 4.2 Write tests for list-accounts route handler
    - Create `/projects/shop-api/tests/routes/list-accounts.test.ts`
    - Test: returns empty array when no accounts exist
    - Test: maps Account_Item fields correctly (including shopUid parsing)
    - Test: includes correct commentCount and tags
    - Test: returns 500 on DynamoDB error
    - **Property 9: Comment count aggregation** — commentCount equals number of COMMENT# items
    - **Property 10: Tag extraction** — tags array matches tag item labels exactly
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.1, 10.2, 10.3, 10.4_

  - [x] 4.3 Implement next-number route handler
    - Create `/projects/shop-api/src/routes/next-number.ts`
    - GetItem with PK=`SEQUENCE#ACCOUNT`, SK=`COUNTER`
    - If item exists, return 200 with `{ nextNumber: item.nextValue }`
    - If item does not exist, return 200 with `{ nextNumber: 1 }`
    - Return 500 with `{ error: "internal_error" }` on DynamoDB failure
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.4 Write tests for next-number route handler
    - Create `/projects/shop-api/tests/routes/next-number.test.ts`
    - Test: returns nextValue from existing counter
    - Test: returns 1 when counter item does not exist
    - Test: returns 500 on DynamoDB error
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 4.5 Implement create-account route handler
    - Create `/projects/shop-api/src/routes/create-account.ts`
    - Parse and validate request body using validation module
    - Return 400 with validation errors on invalid input
    - Return 400 with `{ error: "invalid_json" }` on malformed JSON
    - Return 422 with `max_reached` if accountNumber > 9999999
    - Generate UUID v4 and ISO 8601 createdAt timestamp
    - Build PK using pk-utils
    - Execute TransactWriteItems: Put Account_Item with condition `attribute_not_exists(PK)`, conditionally update Sequence_Counter
    - Return 409 with `duplicate` on ConditionalCheckFailed
    - Return 201 with created account on success
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 4.6 Write tests for create-account route handler
    - Create `/projects/shop-api/tests/routes/create-account.test.ts`
    - Test: successful creation returns 201 with account data
    - Test: duplicate account number returns 409
    - Test: accountNumber > 9999999 returns 422
    - Test: missing required fields returns 400
    - Test: malformed JSON returns 400
    - **Property 2: Sequence counter update logic** — if N ≥ C then new counter is N+1, if N < C counter remains C
    - **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9**

- [x] 5. Checkpoint - Verify utilities and route handlers
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement monolambda entry point and router
  - [x] 6.1 Implement router module
    - Create `/projects/shop-api/src/router.ts`
    - Define route map: `"GET /api/accounts"` → listAccounts, `"GET /api/accounts/next-number"` → nextNumber, `"POST /api/accounts"` → createAccount
    - Implement `routeRequest(event)` that looks up handler by `event.routeKey`
    - Return 404 `{ error: "not_found" }` for unmatched routes
    - _Requirements: 6.1, 6.4_

  - [x] 6.2 Implement monolambda handler entry point
    - Create `/projects/shop-api/src/handler.ts`
    - Export `handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2>`
    - Delegate to `routeRequest(event)`
    - Wrap in top-level try/catch that returns `errorResponse()` for unhandled exceptions
    - _Requirements: 6.1, 6.4, 9.1, 9.2_

  - [x] 6.3 Write unit tests for router
    - Create `/projects/shop-api/tests/router.test.ts`
    - Test: dispatches correct handler for each routeKey
    - Test: returns 404 for unknown routeKey
    - _Requirements: 6.1, 6.4_

- [x] 7. Terraform infrastructure
  - [x] 7.1 Create Lambda infrastructure
    - Create `/infrastructure/lambda.tf`
    - Define `aws_lambda_function.shop_api` — Node.js 20.x, 256 MB, 30s timeout, source from `../projects/shop-api/dist/handler.zip`
    - Define `aws_lambda_function.shop_api_authorizer` — Node.js 20.x, 128 MB, 5s timeout, source from `../projects/shop-api/dist/authorizer.zip`
    - Define `aws_iam_role.shop_api_lambda` with assume role policy for lambda.amazonaws.com
    - Define `aws_iam_role.shop_api_authorizer` with assume role policy for lambda.amazonaws.com
    - Define `aws_iam_role_policy.shop_api_dynamodb` granting GetItem, PutItem, UpdateItem, Query, Scan, TransactWriteItems on Shop_Table ARN
    - Define `aws_iam_role_policy.shop_api_logs` for CloudWatch Logs
    - Define `aws_iam_role_policy.shop_api_authorizer_logs` for CloudWatch Logs
    - Define `aws_lambda_permission` resources allowing API Gateway to invoke both functions
    - Pass environment variables: TABLE_NAME, COGNITO_USER_POOL_ID, AWS_REGION
    - _Requirements: 7.2, 7.3, 7.4, 7.7, 7.8, 7.9_

  - [x] 7.2 Create API Gateway infrastructure
    - Create `/infrastructure/api-gateway.tf`
    - Define `aws_apigatewayv2_api.shop_api` — HTTP protocol, CORS configuration (allow origins `*`, methods GET/POST/OPTIONS, headers Authorization/Content-Type)
    - Define `aws_apigatewayv2_stage.default` — `$default` stage with auto_deploy
    - Define `aws_apigatewayv2_authorizer.cognito` — REQUEST type, Lambda authorizer payload format 2.0, 300s TTL, identity source `$request.header.Authorization`
    - Define `aws_apigatewayv2_integration.monolambda` — AWS_PROXY integration with monolambda
    - Define `aws_apigatewayv2_route` for `GET /api/accounts`, `GET /api/accounts/next-number`, `POST /api/accounts` with authorizer attached
    - _Requirements: 6.1, 6.2, 6.3, 7.1, 7.5, 7.7_

  - [x] 7.3 Add API Gateway output
    - Append to `/infrastructure/outputs.tf` the `shop_api_url` output with the API Gateway invoke URL
    - _Requirements: 7.6_

- [x] 8. Build verification
  - [x] 8.1 Verify build produces deployment artifacts
    - Run `npm install` in `/projects/shop-api/`
    - Run `npm run build` and verify `dist/handler.zip` and `dist/authorizer.zip` are produced
    - Run `npm test` and verify all tests pass
    - _Requirements: 8.3, 8.5_

- [x] 9. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- Terraform tasks (wave 7) can proceed in parallel with Lambda code tasks since they are independent files
- The DynamoDB table and Cognito user pool already exist — no need to create them

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "2.4", "2.6", "2.9", "3.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.5", "2.7", "2.8", "3.2", "3.3", "7.1", "7.2"] },
    { "id": 3, "tasks": ["3.4", "3.5", "3.6", "4.1", "4.3", "4.5", "7.3"] },
    { "id": 4, "tasks": ["4.2", "4.4", "4.6", "6.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["6.3", "8.1"] }
  ]
}
```
