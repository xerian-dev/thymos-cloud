---
inclusion: always
---

# AWS Account Access

## Login

```bash
awsl thymos-cloud
```

This authenticates via SSO and sets `AWS_PROFILE=thymos-cloud`.

## Access Details

- **Region**: `eu-central-1`
- **Profile**: `thymos-cloud`
- **Project name**: `thymos`
- **Environment**: `dev`

## Key Resources

- **Shop table**: `thymos-dev-shop`
- **Import table**: `thymos-dev-import`
- **Import table stream**: Powers the stream handler that syncs staged records to Shop_Table

## What You Can Do

After logging in with `awsl thymos-cloud`, you have access to:

- **CloudWatch Logs** — Check Lambda execution logs for debugging
- **DynamoDB** — Query/scan tables directly (import table, shop table)
- **Parameter Store** — Read SSM parameters (e.g., API keys)
- **Lambda** — Invoke functions directly if needed
- **Step Functions** — Check execution history

## Common Commands

```bash
# Query import jobs
aws dynamodb query \
  --table-name thymos-dev-import \
  --key-condition-expression "PK = :pk AND begins_with(SK, :skPrefix)" \
  --expression-attribute-values '{":pk": {"S": "JOBS"}, ":skPrefix": {"S": "SALE_IMPORT#"}}' \
  --region eu-central-1

# Scan for sale import job metadata
aws dynamodb scan \
  --table-name thymos-dev-import \
  --filter-expression "begins_with(PK, :prefix) AND SK = :sk" \
  --expression-attribute-values '{":prefix": {"S": "SALE_IMPORT#"}, ":sk": {"S": "METADATA"}}' \
  --region eu-central-1

# Check recent Lambda logs
aws logs tail /aws/lambda/thymos-dev-shop-api --since 5m --region eu-central-1
```

## Architecture Reminder

The import flow for ALL entity types (accounts, items, sales) is:

1. **Fetch phase**: Lambda fetches from ConsignCloud API → stages records in import table
2. **Stream sync**: DynamoDB Stream fires on import table writes → stream handler Lambda → entity router → mapper → upsert to Shop_Table

There is NO batch sync orchestrator. The DynamoDB stream handles syncing. Do NOT build batch sync phases.
