---
inclusion: fileMatch
fileMatchPattern: "infrastructure/**/*.tf"
---

# Infrastructure (Terraform) Standards

## General

- Use the latest stable version of the AWS provider
- Pin provider versions to exact versions in `versions.tf` or `main.tf`
- Use `terraform fmt` formatting conventions
- All resources MUST have meaningful names and descriptions where supported

## Resource Constraints

- Do NOT set `reserved_concurrent_executions` on Lambda functions unless explicitly requested by the user
- Do NOT set provisioned concurrency, reserved capacity, or similar resource reservation settings unless explicitly requested
- The AWS account has limited concurrency budget — assume shared pool usage by default

## File Organization

- `main.tf` — primary resource definitions
- `variables.tf` — input variable declarations with descriptions and types
- `outputs.tf` — output value declarations
- `versions.tf` — required provider versions and terraform version constraints (optional, can be in main.tf)

## Variables

- All variables MUST have a `description` and `type`
- Use `default` values only for optional configuration (e.g., environment name)
- Sensitive values MUST be marked with `sensitive = true`

## Outputs

- All outputs consumed by application projects MUST have a `description`
- Use `sensitive = true` for outputs containing secrets

## Naming

- Resource names: snake_case (e.g., `aws_cognito_user_pool.main`)
- Variable names: snake_case
- Output names: snake_case
