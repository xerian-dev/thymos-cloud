---
inclusion: manual
---

# Scripts Reference

## Deploy: `./scripts/deploy-shop-api.sh`

Builds and deploys the shop-api Lambda functions via Terraform.

```bash
./scripts/deploy-shop-api.sh          # Build + deploy (default)
./scripts/deploy-shop-api.sh build    # Build only (npm ci, test, bundle zips)
./scripts/deploy-shop-api.sh deploy   # Terraform apply only (assumes dist/ is current)
```

- The `build` step runs `npm ci`, `vitest run`, and `npm run build` (esbuild → zip)
- The `deploy` step runs `terraform plan` then prompts for apply confirmation
- **Always run the full pipeline (no argument) when source code has changed** — running `deploy` alone reuses the existing zip and won't pick up new code

## Import: `./scripts/import-consigncloud.sh`

CLI wrapper for invoking the import Lambda directly via `aws lambda invoke`.

### API Key Setup

```bash
./scripts/import-consigncloud.sh set-key <api-key>
```

### Account Import

```bash
./scripts/import-consigncloud.sh accounts fetch    # Fetch accounts from ConsignCloud into staging
./scripts/import-consigncloud.sh accounts sync     # Sync staged accounts into the Shop table
./scripts/import-consigncloud.sh accounts run      # Run both fetch and sync
```

### Item Import

```bash
./scripts/import-consigncloud.sh items start                          # Start full import
./scripts/import-consigncloud.sh items start --created-after=2026-01-01  # Import items created after date
./scripts/import-consigncloud.sh items status <job-id>                # Check job progress
./scripts/import-consigncloud.sh items resume <job-id>                # Resume a paused/failed job
```

### Environment Variables

- `ENVIRONMENT` — Target environment (default: `dev`)
- `PROJECT_NAME` — Project name (default: `thymos`)

### How It Works

The script invokes the Lambda directly with a crafted API Gateway-shaped event payload. It does not go through API Gateway or require auth tokens. Responses are parsed from the Lambda's JSON return value.

Item imports are long-running — the Lambda self-re-invokes before timeout. Use `items status` to poll for completion.
