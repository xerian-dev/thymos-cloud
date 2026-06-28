#!/usr/bin/env bash
set -euo pipefail

# Delete all accounts by destroying and recreating DynamoDB tables via Terraform.
# Usage:
#   ./scripts/delete-accounts.sh                    # Dry run (shop table only)
#   ./scripts/delete-accounts.sh --confirm          # Destroy + recreate shop table
#   ./scripts/delete-accounts.sh --all              # Dry run (shop + import tables)
#   ./scripts/delete-accounts.sh --all --confirm    # Destroy + recreate both tables

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/../infrastructure"

ALL=false
CONFIRM=false

for arg in "$@"; do
  case "$arg" in
    --all) ALL=true ;;
    --confirm) CONFIRM=true ;;
  esac
done

cd "$INFRA_DIR"

TARGETS="-target=aws_dynamodb_table.shop -replace=aws_dynamodb_table.shop"
DESCRIPTION="shop table"

if [[ "$ALL" == true ]]; then
  TARGETS="$TARGETS -target=module.import.aws_dynamodb_table.import -replace=module.import.aws_dynamodb_table.import"
  DESCRIPTION="shop table + import table"
fi

echo "Target: ${DESCRIPTION}"
echo ""

if [[ "$CONFIRM" != true ]]; then
  terraform plan $TARGETS
  echo ""
  echo "Dry run — no changes applied."
  echo "Run with --confirm to destroy and recreate."
  exit 0
fi

echo "Destroying and recreating ${DESCRIPTION}..."
terraform apply $TARGETS -auto-approve

echo ""
echo "Done. Tables recreated (empty)."
