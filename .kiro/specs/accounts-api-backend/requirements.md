# Requirements Document

## Introduction

This feature implements the backend API for the accounts page. It provides three HTTP endpoints (`GET /api/accounts`, `GET /api/accounts/next-number`, `POST /api/accounts`) served by a monolambda behind an API Gateway HTTP API. Authorization is enforced at the API Gateway level via a Lambda authorizer that inspects Cognito JWT group claims. The backend Lambda source lives at `/projects/shop-api/` as a separate TypeScript project in the monorepo. Infrastructure is defined in Terraform alongside the existing resources.

## Glossary

- **Monolambda**: A single AWS Lambda function that handles multiple routes via internal routing based on the API Gateway `routeKey` event property
- **Lambda_Authorizer**: An AWS Lambda function invoked by API Gateway before route handlers, responsible for extracting Cognito group claims from the JWT and returning IAM allow/deny policies per route
- **API_Gateway**: AWS API Gateway HTTP API that routes HTTP requests to the Monolambda and enforces authorization via the Lambda_Authorizer
- **Shop_Table**: The existing DynamoDB single-table (`thymos-<env>-shop`) storing all shop entities with composite PK/SK string keys
- **Sequence_Counter**: A DynamoDB item (PK=`SEQUENCE#ACCOUNT`, SK=`COUNTER`) that tracks the next available account number
- **Account_Item**: A DynamoDB item (PK=`ACCOUNT#<uid>`, SK=`METADATA`) storing account metadata (name, address, telephone, uuid, createdAt)
- **Cognito_User_Pool**: The existing AWS Cognito User Pool providing authentication and group membership
- **Admin_Group**: The existing Cognito user group named `admin` with write access to accounts
- **Readonly_Group**: A Cognito user group with read-only access to accounts

## Requirements

### Requirement 1: List Accounts Endpoint

**User Story:** As an authenticated user, I want to fetch all accounts, so that I can view them in the accounts data table.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/accounts`, THE Monolambda SHALL query the Shop_Table for all items with SK equal to `METADATA` and return a JSON response with Content-Type `application/json`, HTTP status 200, containing an `accounts` array.
2. THE Monolambda SHALL map each Account_Item to a response object containing `uuid` (string), `shopUid` (integer, derived by stripping the `ACCOUNT#` prefix from the PK and parsing the remaining zero-padded string as a base-10 integer), `name` (string), `address` (string), `telephone` (string), `commentCount` (integer), and `tags` (array of strings) fields.
3. WHEN the Shop_Table contains no Account_Items, THE Monolambda SHALL return HTTP status 200 with an empty `accounts` array.
4. IF the Shop_Table query fails, THEN THE Monolambda SHALL return HTTP status 500 with a JSON body containing an `error` field with value `internal_error`.

### Requirement 2: Next Account Number Endpoint

**User Story:** As an authenticated user, I want to retrieve the next available account number, so that it can be pre-filled in the account creation form.

#### Acceptance Criteria

1. WHEN a GET request is received at `/api/accounts/next-number`, THE Monolambda SHALL read the Sequence_Counter item from the Shop_Table and return a JSON response with HTTP status 200 containing a `nextNumber` field set to the integer value of the Sequence_Counter `nextValue` attribute.
2. IF the Sequence_Counter item does not exist in the Shop_Table, THEN THE Monolambda SHALL return HTTP status 200 with `nextNumber` set to 1.
3. IF the Shop_Table read fails, THEN THE Monolambda SHALL return HTTP status 500 with a JSON body containing an `error` field with value `internal_error`.

### Requirement 3: Create Account Endpoint

**User Story:** As an admin user, I want to create a new account, so that I can add consigner records to the system.

#### Acceptance Criteria

1. WHEN a POST request is received at `/api/accounts` with a valid JSON body containing `accountNumber`, `name`, `address`, and `telephone`, THE Monolambda SHALL create an Account_Item in the Shop_Table and return HTTP status 201 with the created account as JSON
2. THE Monolambda SHALL generate a UUID for the new account and set `createdAt` to the current ISO 8601 timestamp
3. THE Monolambda SHALL construct the Account_Item PK as `ACCOUNT#` followed by the `accountNumber` zero-padded to 7 digits
4. THE Monolambda SHALL use a DynamoDB TransactWriteItems operation that atomically puts the Account_Item with a condition that the PK does not already exist, and updates the Sequence_Counter
5. WHEN the `accountNumber` is greater than or equal to the current Sequence_Counter `nextValue`, THE Monolambda SHALL update the Sequence_Counter `nextValue` to `accountNumber` plus 1
6. WHEN the `accountNumber` is less than the current Sequence_Counter `nextValue`, THE Monolambda SHALL leave the Sequence_Counter `nextValue` unchanged
7. IF the TransactWriteItems operation fails due to the condition check (PK already exists), THEN THE Monolambda SHALL return HTTP status 409 with response body `duplicate`
8. IF the `accountNumber` exceeds 9999999, THEN THE Monolambda SHALL return HTTP status 422 with response body `max_reached`
9. IF the request body is missing required fields or contains invalid data, THEN THE Monolambda SHALL return HTTP status 400 with a descriptive JSON error response

### Requirement 4: Request Validation

**User Story:** As a developer, I want the API to validate incoming requests, so that invalid data does not reach the data layer.

#### Acceptance Criteria

1. THE Monolambda SHALL validate that `accountNumber` is an integer between 1 and 9999999 inclusive
2. THE Monolambda SHALL validate that `name` is a non-empty string with a maximum length of 100 characters containing at least one non-whitespace character
3. THE Monolambda SHALL validate that `address` is a string with a maximum length of 500 characters when provided
4. THE Monolambda SHALL validate that `telephone` is a string with a maximum length of 30 characters when provided
5. WHEN validation fails, THE Monolambda SHALL return HTTP status 400 with a JSON body describing the validation errors

### Requirement 5: Lambda Authorizer

**User Story:** As a system operator, I want API routes protected by group-based authorization, so that only permitted users can access each endpoint.

#### Acceptance Criteria

1. WHEN a request arrives at the API_Gateway, THE Lambda_Authorizer SHALL extract the `cognito:groups` claim from the JWT token provided in the Authorization header using the Bearer scheme.
2. WHEN the JWT contains the `admin` group claim, THE Lambda_Authorizer SHALL return an IAM policy allowing access to all routes (GET and POST).
3. WHEN the JWT contains the `readonly` group claim but not the `admin` group claim, THE Lambda_Authorizer SHALL return an IAM policy allowing access to GET routes only.
4. IF the Authorization header is missing, does not use the Bearer scheme, the JWT is malformed, or the JWT does not contain a recognized group claim (`admin` or `readonly`), THEN THE Lambda_Authorizer SHALL return an IAM deny policy resulting in an HTTP 401 response to the client.
5. THE Lambda_Authorizer SHALL validate the JWT signature against the Cognito_User_Pool JSON Web Key Set (JWKS).
6. THE Lambda_Authorizer SHALL validate the JWT `iss` claim matches the Cognito_User_Pool URL and the `token_use` claim is `access`.
7. IF the JWT has expired, THEN THE Lambda_Authorizer SHALL return an IAM deny policy resulting in an HTTP 401 response to the client.
8. THE API_Gateway SHALL cache Lambda_Authorizer responses for 300 seconds using the Authorization header as the cache key.

### Requirement 6: API Gateway Configuration

**User Story:** As a developer, I want the API Gateway configured with proper routing, so that requests reach the correct Lambda function with authorization enforced.

#### Acceptance Criteria

1. THE API_Gateway SHALL define routes for `GET /api/accounts`, `GET /api/accounts/next-number`, and `POST /api/accounts` integrated with the Monolambda
2. THE API_Gateway SHALL attach the Lambda_Authorizer to all defined routes
3. THE API_Gateway SHALL configure CORS to allow requests from the frontend origin
4. THE API_Gateway SHALL pass the `routeKey` in the event payload so the Monolambda can route internally

### Requirement 7: Infrastructure as Code

**User Story:** As a DevOps engineer, I want all backend resources defined in Terraform, so that infrastructure is reproducible and version-controlled.

#### Acceptance Criteria

1. THE Terraform configuration SHALL define an `aws_apigatewayv2_api` resource for the HTTP API with protocol type `HTTP`.
2. THE Terraform configuration SHALL define an `aws_lambda_function` resource for the Monolambda with a Node.js 20.x runtime, a memory size of 256 MB, and a timeout of 30 seconds.
3. THE Terraform configuration SHALL define an `aws_lambda_function` resource for the Lambda_Authorizer with a Node.js 20.x runtime, a memory size of 128 MB, and a timeout of 5 seconds.
4. THE Terraform configuration SHALL define IAM roles granting the Monolambda `dynamodb:GetItem`, `dynamodb:PutItem`, `dynamodb:UpdateItem`, `dynamodb:Query`, and `dynamodb:TransactWriteItems` permissions on the Shop_Table, and granting the Lambda_Authorizer no DynamoDB permissions.
5. THE Terraform configuration SHALL define `aws_apigatewayv2_route` resources for `GET /api/accounts`, `GET /api/accounts/next-number`, and `POST /api/accounts`, each with a Lambda proxy integration targeting the Monolambda and the Lambda_Authorizer attached.
6. THE Terraform configuration SHALL output the API Gateway invoke URL for frontend configuration.
7. THE Terraform configuration SHALL use the existing `var.project_name` and `var.environment` variables for resource naming following the pattern `${var.project_name}-${var.environment}-<resource-suffix>`.
8. THE Terraform configuration SHALL define `aws_lambda_permission` resources allowing the API_Gateway to invoke both the Monolambda and the Lambda_Authorizer.
9. THE Terraform configuration SHALL reference Lambda deployment artifacts from the `/projects/shop-api/dist/` directory for both Lambda functions.

### Requirement 8: Lambda Project Structure

**User Story:** As a developer, I want the backend Lambda code organized as a separate TypeScript project, so that it can be built and deployed independently.

#### Acceptance Criteria

1. THE Monolambda source code SHALL reside at `/projects/shop-api/` as a separate project in the monorepo
2. THE Monolambda project SHALL use TypeScript with strict mode enabled
3. THE Monolambda project SHALL use esbuild for bundling into a single deployment artifact
4. THE Lambda_Authorizer source code SHALL reside within the `/projects/shop-api/` project
5. THE Monolambda project SHALL include a build script that produces deployment-ready zip artifacts for both Lambda functions

### Requirement 9: Error Response Format

**User Story:** As a frontend developer, I want consistent error responses from the API, so that the frontend can handle errors predictably.

#### Acceptance Criteria

1. WHEN the Monolambda encounters a DynamoDB service error, THE Monolambda SHALL return HTTP status 500 with a JSON body containing an `error` field with value `internal_error`
2. THE Monolambda SHALL NOT include stack traces, internal identifiers, or infrastructure details in error response bodies
3. WHEN the Monolambda returns a 409 status, THE response body SHALL be the string `duplicate`
4. WHEN the Monolambda returns a 422 status, THE response body SHALL be the string `max_reached`

### Requirement 10: Account Response Enrichment

**User Story:** As a frontend developer, I want the list accounts response to include comment counts and tags, so that the data table can display complete account information.

#### Acceptance Criteria

1. WHEN listing accounts, THE Monolambda SHALL query comment items (SK begins with `COMMENT#`) for each account and include the count in the `commentCount` field
2. WHEN listing accounts, THE Monolambda SHALL query tag items (SK begins with `TAG#`) for each account and include the tag names in the `tags` array field
3. IF an account has no comments, THE Monolambda SHALL set `commentCount` to 0
4. IF an account has no tags, THE Monolambda SHALL set `tags` to an empty array
