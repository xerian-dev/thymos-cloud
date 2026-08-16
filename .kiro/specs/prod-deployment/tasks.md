# Implementation Plan: Production Deployment Infrastructure

## Overview

Refactor the Terraform infrastructure from a single hardcoded dev environment to a multi-environment setup with separate state, frontend hosting (S3 + CloudFront), Route 53 DNS, ACM certificates, and API Gateway custom domains. All work is in the `infrastructure/` directory.

## Tasks

- [x] 1. Create environment configuration files
  - [x] 1.1 Create `environments/` directory with backend config files
    - Create `environments/dev.tfbackend` with bucket=thymos-dev-tfstate, key=infrastructure/terraform.tfstate, region=eu-central-1
    - Create `environments/prod.tfbackend` with bucket=thymos-prod-tfstate, key=infrastructure/terraform.tfstate, region=eu-central-1
    - _Requirements: 1.1, 1.2, 1.3, 1.6_

  - [x] 1.2 Create environment-specific tfvars files
    - Create `environments/dev.tfvars` with environment="dev", base_domain="thymos.cloud", domain_name="dev.thymos.cloud", api_domain_name="dev-api.thymos.cloud", allowed_origins=["*"], hosted_zone_id=""
    - Create `environments/prod.tfvars` with environment="prod", base_domain="thymos.cloud", domain_name="app.thymos.cloud", api_domain_name="api.thymos.cloud", allowed_origins=["https://app.thymos.cloud"], hosted_zone_id=""
    - _Requirements: 1.4, 1.5, 7.1, 7.2, 7.3_

- [x] 2. Refactor backend and provider configuration
  - [x] 2.1 Change `backend.tf` to partial backend configuration
    - Replace the hardcoded S3 backend block with an empty `backend "s3" {}` block
    - _Requirements: 1.1, 8.1, 8.2_

  - [x] 2.2 Add new variables to `variables.tf`
    - Add `base_domain` (string, default "thymos.cloud")
    - Add `domain_name` (string, no default — required)
    - Add `api_domain_name` (string, no default — required)
    - Add `allowed_origins` (list(string), default ["*"])
    - Add `hosted_zone_id` (string, default "")
    - _Requirements: 4.1, 6.4, 7.3_

  - [x] 2.3 Add `us-east-1` provider alias to `main.tf`
    - Add `provider "aws" { alias = "us_east_1"; region = "us-east-1" }` block
    - _Requirements: 5.1_

- [x] 3. Remove self-managed tfstate bucket from Terraform
  - [x] 3.1 Remove tfstate bucket resources from `s3.tf`
    - Remove `aws_s3_bucket.tfstate`, `aws_s3_bucket_versioning.tfstate`, `aws_s3_bucket_server_side_encryption_configuration.tfstate`, `aws_s3_bucket_public_access_block.tfstate`
    - Keep the items bucket resources unchanged
    - Note: Before applying, `terraform state rm` must be run for each resource (documented in deployment runbook)
    - _Requirements: 8.1, 8.2_

- [x] 4. Create frontend hosting module
  - [x] 4.1 Create `modules/frontend/variables.tf`
    - Define inputs: project_name, environment, domain_name, acm_certificate_arn, default_root_object (default "index.html")
    - _Requirements: 3.1, 3.2, 3.6, 3.7_

  - [x] 4.2 Create `modules/frontend/main.tf`
    - S3 bucket with private access, AES256 encryption, public access blocked
    - S3 bucket policy allowing CloudFront OAC to GetObject
    - CloudFront Origin Access Control (s3 origin type, always signing)
    - CloudFront distribution with: S3 origin + OAC, redirect-to-https, CachingOptimized policy, PriceClass_100, custom error responses for SPA routing (403→200 /index.html, 404→200 /index.html), alternate domain name, ACM certificate, TLSv1.2_2021
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 4.3 Create `modules/frontend/outputs.tf`
    - Output: cloudfront_distribution_domain_name, cloudfront_distribution_hosted_zone_id, s3_bucket_name, s3_bucket_arn, cloudfront_distribution_id
    - _Requirements: 3.2_

- [x] 5. Checkpoint
  - Ensure all module files pass `terraform fmt -check`. Ask the user if questions arise.

- [x] 6. Create DNS and certificate configuration
  - [x] 6.1 Create `dns.tf` with Route 53 hosted zone and DNS records
    - Conditional hosted zone: create only when `var.hosted_zone_id == ""` (prod creates it, dev uses the ID)
    - Local `zone_id` resolving to either the created zone or the passed variable
    - A record alias for frontend domain → CloudFront distribution
    - A record alias for API domain → API Gateway custom domain
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

  - [x] 6.2 Create `certificates.tf` with ACM certificates and DNS validation
    - Frontend certificate in us-east-1 (using aws.us_east_1 provider) for var.domain_name
    - API certificate in eu-central-1 (default provider) for var.api_domain_name
    - DNS validation records in Route 53 for both certificates using for_each over domain_validation_options
    - `aws_acm_certificate_validation` resources to wait for validation
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 7. Wire frontend module and API Gateway custom domains
  - [x] 7.1 Create `frontend.tf` to invoke the frontend module
    - Module invocation passing project_name, environment, domain_name, acm_certificate_arn (from frontend cert)
    - _Requirements: 3.1, 3.2, 3.6, 3.7_

  - [x] 7.2 Modify `api-gateway.tf` for custom domains and CORS variable
    - Add `aws_apigatewayv2_domain_name.api` resource with var.api_domain_name, regional endpoint, TLS 1.2, referencing the API ACM certificate
    - Add `aws_apigatewayv2_api_mapping.api` resource mapping the custom domain to the API stage
    - Change CORS `allow_origins` from hardcoded `["*"]` to `var.allowed_origins`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2_

- [x] 8. Update outputs
  - [x] 8.1 Update `outputs.tf` with new outputs
    - Add: hosted_zone_id, hosted_zone_name_servers, cloudfront_distribution_id, frontend_bucket_name, frontend_domain, api_domain
    - _Requirements: 4.6_

- [x] 9. Validation checkpoint
  - [x] 9.1 Run `terraform fmt` and `terraform validate`
    - Run `terraform fmt -recursive` on the infrastructure directory
    - Run `terraform init -backend-config=environments/dev.tfbackend -reconfigure` then `terraform validate`
    - Fix any formatting or validation errors
    - _Requirements: 8.1, 8.3_

- [x] 10. Create deployment runbook
  - [x] 10.1 Create `DEPLOYMENT.md` in the infrastructure directory
    - Document: prod state bucket bootstrap (AWS CLI commands for create bucket, enable versioning, enable encryption, block public access)
    - Document: migration procedure from hardcoded to partial backend (`terraform state rm` commands, `terraform init -reconfigure`)
    - Document: deployment order (bootstrap prod bucket → deploy prod → get zone ID + NS servers → configure NS at registrar → set hosted_zone_id in dev.tfvars → deploy dev)
    - Document: CLI commands for each environment (`terraform init -backend-config=...`, `terraform apply -var-file=...`)
    - Document: post-deployment verification steps (dig DNS records, check HTTPS, verify CORS)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 8.2, 8.3_

- [x] 11. Final checkpoint
  - Ensure all files pass `terraform fmt -check` and `terraform validate`. Ask the user if questions arise.

## Notes

- This is an IaC-only implementation — no application code changes
- No unit tests or property-based tests; validation uses `terraform validate`, `terraform fmt`, and `terraform plan`
- The `modules/import/` directory is not modified
- Deployment order is critical: prod must be deployed first to create the hosted zone, then dev uses the zone ID
- The tfstate bucket resources must be removed from Terraform state (`terraform state rm`) BEFORE removing the code — otherwise Terraform will destroy the actual bucket
- ACM certificate validation requires NS records to be configured at the external registrar — this is a manual step between prod deploy and full HTTPS availability
- CloudFront distributions take 10-20 minutes to deploy; `terraform apply` will wait for completion

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3"] },
    { "id": 2, "tasks": ["3.1", "4.1"] },
    { "id": 3, "tasks": ["4.2", "4.3"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["7.1", "7.2", "8.1"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["10.1"] }
  ]
}
```
