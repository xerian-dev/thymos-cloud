#!/usr/bin/env bash
set -euo pipefail

# Deploy Shop API Lambdas
# Usage:
#   ./scripts/deploy-shop-api.sh          # Build + terraform apply
#   ./scripts/deploy-shop-api.sh build    # Build only
#   ./scripts/deploy-shop-api.sh deploy   # Terraform apply only (assumes already built)

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
SHOP_API_DIR="$ROOT_DIR/projects/shop-api"
INFRA_DIR="$ROOT_DIR/infrastructure"

function build() {
  echo "=== Building shop-api ==="
  cd "$SHOP_API_DIR"

  echo "Installing dependencies..."
  npm ci --silent

  echo "Running tests..."
  npx vitest run

  echo "Bundling Lambda functions..."
  npm run build

  echo ""
  echo "Build artifacts:"
  ls -lh dist/*.zip
  echo ""
}

function deploy() {
  echo "=== Deploying via Terraform ==="
  cd "$INFRA_DIR"

  echo "Running terraform plan..."
  terraform plan -out=tfplan

  echo ""
  read -p "Apply this plan? [y/N] " -n 1 -r
  echo ""
  if [[ $REPLY =~ ^[Yy]$ ]]; then
    terraform apply tfplan
    echo ""
    echo "Deploy complete."
  else
    echo "Aborted."
    rm -f tfplan
    exit 0
  fi
}

case "${1:-all}" in
  build)
    build
    ;;
  deploy)
    deploy
    ;;
  all|"")
    build
    deploy
    ;;
  *)
    echo "Usage: $0 [build|deploy|all]"
    echo ""
    echo "  build   — Build and test the shop-api project"
    echo "  deploy  — Run terraform apply (assumes dist/ is up to date)"
    echo "  all     — Build then deploy (default)"
    exit 1
    ;;
esac
