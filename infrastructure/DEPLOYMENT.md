# Deployment Runbook

This document covers the full deployment procedure for the multi-environment Terraform infrastructure.

## Prerequisites

- AWS CLI installed
- Terraform installed
- SSO access configured

```bash
awsl thymos-cloud
```

This authenticates via SSO and sets `AWS_PROFILE=thymos-cloud`. All commands below assume this has been run.

## Deployment Order

1. Bootstrap prod state bucket (one-time)
2. Deploy prod environment (creates Route 53 hosted zone)
3. Record NS servers and zone ID from prod output
4. Configure NS records at the external registrar for `thymos.cloud`
5. Set `hosted_zone_id` in `environments/dev.tfvars` from prod output
6. Deploy dev environment

## 1. Bootstrap Prod State Bucket

One-time setup. Creates the S3 bucket for prod Terraform state.

```bash
aws s3api create-bucket \
  --bucket thymos-prod-tfstate \
  --region eu-central-1 \
  --create-bucket-configuration LocationConstraint=eu-central-1

aws s3api put-bucket-versioning \
  --bucket thymos-prod-tfstate \
  --versioning-configuration Status=Enabled

aws s3api put-bucket-encryption \
  --bucket thymos-prod-tfstate \
  --server-side-encryption-configuration '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'

aws s3api put-public-access-block \
  --bucket thymos-prod-tfstate \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
```

## 2. State Migration (First Apply Only)

Before the first `terraform apply` after this refactor, the tfstate bucket resources that were removed from `s3.tf` must be removed from Terraform state. Otherwise Terraform will attempt to destroy the actual bucket.

```bash
# Initialize with dev backend (existing state)
terraform init -backend-config=environments/dev.tfbackend -reconfigure

# Remove tfstate bucket resources from state
terraform state rm aws_s3_bucket.tfstate
terraform state rm aws_s3_bucket_versioning.tfstate
terraform state rm aws_s3_bucket_server_side_encryption_configuration.tfstate
terraform state rm aws_s3_bucket_public_access_block.tfstate
```

After running these commands, Terraform no longer tracks the dev state bucket as a managed resource. The bucket continues to exist and store state as before.

## 3. Deploy Prod

```bash
terraform init -backend-config=environments/prod.tfbackend -reconfigure
terraform plan -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```

After apply completes, capture the outputs:

```bash
terraform output hosted_zone_id
terraform output hosted_zone_name_servers
```

## 4. Configure NS at Registrar

Take the name servers from the prod output and configure them at the domain registrar for `thymos.cloud`. This is a manual step outside of Terraform.

Certificate validation (ACM) depends on NS propagation. Until the registrar delegates to the Route 53 name servers, certificates will remain in `PENDING_VALIDATION` status and `terraform apply` will block.

## 5. Update Dev Configuration

Set the `hosted_zone_id` value in `environments/dev.tfvars` to the zone ID output from prod:

```hcl
hosted_zone_id = "Z0123456789EXAMPLE"  # from terraform output hosted_zone_id
```

## 6. Deploy Dev

```bash
terraform init -backend-config=environments/dev.tfbackend -reconfigure
terraform plan -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

## Expected Timing

| Operation | Duration |
|-----------|----------|
| CloudFront distribution creation | 10-20 minutes |
| ACM certificate validation | Depends on NS propagation (minutes to hours) |
| `terraform apply` blocking | Waits for both CloudFront and cert validation to complete |

If NS records are not yet configured at the registrar, `terraform apply` will block indefinitely waiting for certificate validation. Cancel with Ctrl+C and re-run after NS propagation is confirmed.

## Post-Deployment Verification

- Confirm CloudFront returns `index.html` for arbitrary paths (SPA routing):
  ```bash
  curl -I https://app.thymos.cloud/some/random/path
  ```
- Confirm custom domains resolve correctly:
  ```bash
  dig app.thymos.cloud
  dig api.thymos.cloud
  dig dev.thymos.cloud
  dig dev-api.thymos.cloud
  ```
- Confirm HTTPS works on all custom domains (no certificate errors)
- Confirm CORS headers match expected origins:
  ```bash
  curl -H "Origin: https://app.thymos.cloud" -I https://api.thymos.cloud/
  ```
- Confirm dev environment API still works at its existing URL

## Rollback

- **State buckets** are versioned — state can be recovered from S3 versioning
- **CloudFront distributions** can be disabled without deletion if issues arise
- **Dev environment** — re-apply with original dev.tfvars values to revert changes
- If a deployment breaks dev, the existing API Gateway URL (`https://7ne4yil3k7.execute-api.eu-central-1.amazonaws.com/`) continues to work independently of custom domains

## CLI Quick Reference

```bash
# Authenticate
awsl thymos-cloud

# Dev
terraform init -backend-config=environments/dev.tfbackend -reconfigure
terraform plan -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars

# Prod
terraform init -backend-config=environments/prod.tfbackend -reconfigure
terraform plan -var-file=environments/prod.tfvars
terraform apply -var-file=environments/prod.tfvars
```
