# Requirements Document

## Introduction

Refactor the existing single-environment Terraform infrastructure to support both `dev` and `prod` environments with separate state files. Add S3 + CloudFront frontend hosting for the React shop application in both environments, configure Route 53 DNS with custom domains, and provision ACM certificates for HTTPS. The existing dev deployment must not be disrupted during this transition.

## Glossary

- **Infrastructure**: The Terraform project at `infrastructure/` that provisions AWS resources for both environments
- **Environment**: A deployment target (`dev` or `prod`) with isolated state, resources, and configuration
- **Frontend**: The React shop application at `projects/shop/` built with Vite
- **Shop_API**: The Node.js Lambda-based API Gateway backend at `projects/shop-api/`
- **State_Bucket**: An S3 bucket storing Terraform state files for a given environment
- **CloudFront_Distribution**: An AWS CloudFront CDN distribution serving the frontend static assets from S3
- **Hosted_Zone**: A Route 53 hosted zone managing DNS records for `thymos.cloud`
- **ACM_Certificate**: An AWS Certificate Manager TLS certificate for securing custom domains
- **Backend_Config**: A Terraform partial backend configuration file specifying environment-specific state bucket and key
- **Tfvars_File**: A Terraform variable definition file providing environment-specific values

## Requirements

### Requirement 1: Environment Isolation via Terraform Workspaces

**User Story:** As a developer, I want separate Terraform state and configuration for dev and prod environments, so that changes to one environment do not affect the other.

#### Acceptance Criteria

1. THE Infrastructure SHALL use partial backend configuration with separate `-backend-config` files for each environment
2. WHEN deploying to the dev environment, THE Infrastructure SHALL store state in `s3://thymos-dev-tfstate` with key `infrastructure/terraform.tfstate`
3. WHEN deploying to the prod environment, THE Infrastructure SHALL store state in `s3://thymos-prod-tfstate` with key `infrastructure/terraform.tfstate`
4. THE Infrastructure SHALL provide a `dev.tfvars` file containing dev-specific variable values (environment = "dev", allowed_origins = ["*"])
5. THE Infrastructure SHALL provide a `prod.tfvars` file containing prod-specific variable values (environment = "prod", allowed_origins = ["https://app.thymos.cloud"])
6. WHEN applying Terraform to an environment, THE Infrastructure SHALL require explicit specification of the backend-config file and tfvars file via CLI flags

### Requirement 2: Production State Bucket Bootstrap

**User Story:** As a developer, I want a documented procedure to bootstrap the production state bucket, so that prod Terraform state can be stored safely before first deployment.

#### Acceptance Criteria

1. THE Infrastructure SHALL document AWS CLI commands to create the `thymos-prod-tfstate` S3 bucket in `eu-central-1`
2. THE Infrastructure SHALL document enabling versioning on the prod state bucket
3. THE Infrastructure SHALL document enabling server-side encryption (AES256) on the prod state bucket
4. THE Infrastructure SHALL document blocking all public access on the prod state bucket

### Requirement 3: Frontend Hosting with S3 and CloudFront

**User Story:** As a developer, I want the React frontend served via S3 + CloudFront, so that the shop application loads quickly and is globally distributed.

#### Acceptance Criteria

1. THE Infrastructure SHALL create an S3 bucket per environment for hosting frontend static assets with public access blocked
2. THE Infrastructure SHALL create a CloudFront_Distribution per environment with an origin access control (OAC) pointing to the frontend S3 bucket
3. THE CloudFront_Distribution SHALL serve the S3 contents as the default root object (`index.html`)
4. THE CloudFront_Distribution SHALL use a custom error response to return `index.html` with HTTP 200 for 403 and 404 errors (SPA routing)
5. THE CloudFront_Distribution SHALL enforce HTTPS by redirecting HTTP to HTTPS
6. THE CloudFront_Distribution SHALL use the environment-specific ACM_Certificate from `us-east-1`
7. THE CloudFront_Distribution SHALL use the environment-specific custom domain as an alternate domain name (CNAME)

### Requirement 4: DNS Configuration via Route 53

**User Story:** As a developer, I want DNS records managed in Route 53, so that custom domains resolve to the correct AWS resources for each environment.

#### Acceptance Criteria

1. THE Infrastructure SHALL create a single Route 53 Hosted_Zone for `thymos.cloud`
2. THE Infrastructure SHALL create an A record alias for `app.thymos.cloud` pointing to the prod CloudFront_Distribution
3. THE Infrastructure SHALL create an A record alias for `api.thymos.cloud` pointing to the prod API Gateway custom domain
4. THE Infrastructure SHALL create an A record alias for `dev.thymos.cloud` pointing to the dev CloudFront_Distribution
5. THE Infrastructure SHALL create an A record alias for `dev-api.thymos.cloud` pointing to the dev API Gateway custom domain
6. THE Infrastructure SHALL output the Hosted_Zone name servers so the user can configure them at the external registrar

### Requirement 5: ACM Certificates for TLS

**User Story:** As a developer, I want ACM certificates provisioned and validated for all custom domains, so that HTTPS is enforced everywhere.

#### Acceptance Criteria

1. THE Infrastructure SHALL provision an ACM_Certificate in `us-east-1` covering the frontend domain for each environment (CloudFront requirement)
2. THE Infrastructure SHALL provision an ACM_Certificate in `eu-central-1` covering the API domain for each environment (API Gateway requirement)
3. THE Infrastructure SHALL validate all ACM certificates using DNS validation records in the Route 53 Hosted_Zone
4. WHEN a certificate is pending validation, THE Infrastructure SHALL create the required CNAME validation records in Route 53

### Requirement 6: API Gateway Custom Domains

**User Story:** As a developer, I want API Gateway accessible via custom domains, so that the API has clean, environment-specific URLs.

#### Acceptance Criteria

1. THE Infrastructure SHALL create an API Gateway custom domain name for `api.thymos.cloud` (prod) using the `eu-central-1` ACM_Certificate
2. THE Infrastructure SHALL create an API Gateway custom domain name for `dev-api.thymos.cloud` (dev) using the `eu-central-1` ACM_Certificate
3. THE Infrastructure SHALL create API mappings from each custom domain to the corresponding API Gateway stage
4. THE Infrastructure SHALL configure the API Gateway CORS `allowed_origins` from a variable that differs per environment

### Requirement 7: CORS Restriction for Production

**User Story:** As a developer, I want prod CORS restricted to the production frontend domain, so that unauthorized origins cannot call the production API.

#### Acceptance Criteria

1. WHILE the environment is prod, THE Infrastructure SHALL set API Gateway CORS allowed origins to `["https://app.thymos.cloud"]`
2. WHILE the environment is dev, THE Infrastructure SHALL set API Gateway CORS allowed origins to `["*"]`
3. THE Infrastructure SHALL expose `allowed_origins` as a variable overridable via Tfvars_File

### Requirement 8: Non-Disruption of Existing Dev Environment

**User Story:** As a developer, I want the existing dev deployment to remain functional during and after the infrastructure refactor, so that development work is not interrupted.

#### Acceptance Criteria

1. WHEN migrating to partial backend configuration, THE Infrastructure SHALL preserve the existing dev state in `s3://thymos-dev-tfstate` at key `infrastructure/terraform.tfstate`
2. THE Infrastructure SHALL document the migration procedure for switching from hardcoded backend to partial backend configuration
3. IF the backend configuration changes require re-initialization, THEN THE Infrastructure SHALL provide instructions using `terraform init -reconfigure` with the dev backend-config file
