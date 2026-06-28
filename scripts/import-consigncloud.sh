#!/usr/bin/env bash
set -euo pipefail

# ConsignCloud Import Script
# Usage:
#   ./scripts/import-consigncloud.sh set-key <api-key>
#   ./scripts/import-consigncloud.sh fetch
#   ./scripts/import-consigncloud.sh sync
#   ./scripts/import-consigncloud.sh run

ENVIRONMENT="${ENVIRONMENT:-dev}"
PROJECT_NAME="${PROJECT_NAME:-thymos}"
SSM_PATH="/${PROJECT_NAME}/${ENVIRONMENT}/consigncloud-api-key"

case "${1:-help}" in
  set-key)
    API_KEY="${2:-}"
    if [[ -z "$API_KEY" ]]; then
      echo "Usage: $0 set-key <consigncloud-api-key>"
      exit 1
    fi
    echo "Setting ConsignCloud API key in SSM at ${SSM_PATH}..."
    aws ssm put-parameter \
      --name "$SSM_PATH" \
      --type SecureString \
      --value "$API_KEY" \
      --overwrite
    echo "Done."
    ;;

  fetch)
    LAMBDA_NAME="${PROJECT_NAME}-${ENVIRONMENT}-shop-import"
    PAYLOAD='{"rawPath":"/api/import/fetch","requestContext":{"http":{"method":"POST","path":"/api/import/fetch"}}}'
    echo "Invoking fetch Lambda: ${LAMBDA_NAME}..."
    if ! aws lambda invoke \
      --function-name "$LAMBDA_NAME" \
      --payload "$PAYLOAD" \
      --cli-binary-format raw-in-base64-out \
      /tmp/fetch-response.json; then
      echo "ERROR: Lambda invocation failed."
      exit 1
    fi
    echo ""
    echo "Response:"
    python3 -c "import json; r=json.load(open('/tmp/fetch-response.json')); body=r.get('body','{}'); print(json.dumps(json.loads(body) if body else {}, indent=2))" || cat /tmp/fetch-response.json
    ;;

  sync)
    LAMBDA_NAME="${PROJECT_NAME}-${ENVIRONMENT}-shop-import"
    LOG_GROUP="/aws/lambda/${LAMBDA_NAME}"
    PAYLOAD='{"rawPath":"/api/import/sync","requestContext":{"http":{"method":"POST","path":"/api/import/sync"}}}'

    echo "Invoking sync Lambda: ${LAMBDA_NAME}..."

    # Start log tailing in background
    aws logs tail "$LOG_GROUP" --follow --format short \
      --filter-pattern "Sync" 2>/dev/null &
    TAIL_PID=$!

    # Invoke Lambda (blocks until complete; 5min read timeout matches Lambda timeout)
    if ! aws lambda invoke \
      --function-name "$LAMBDA_NAME" \
      --payload "$PAYLOAD" \
      --cli-binary-format raw-in-base64-out \
      --cli-read-timeout 300 \
      /tmp/sync-response.json; then
      kill "$TAIL_PID" 2>/dev/null || true
      echo "ERROR: Lambda invocation failed."
      exit 1
    fi

    # Stop log tailing
    kill "$TAIL_PID" 2>/dev/null || true
    wait "$TAIL_PID" 2>/dev/null || true

    echo ""
    echo "=== Final Result ==="
    python3 -c "import json; r=json.load(open('/tmp/sync-response.json')); body=r.get('body','{}'); print(json.dumps(json.loads(body) if body else {}, indent=2))" || cat /tmp/sync-response.json
    ;;

  run)
    echo "=== Phase 1: Fetch from ConsignCloud ==="
    LAMBDA_NAME="${PROJECT_NAME}-${ENVIRONMENT}-shop-import"
    if ! aws lambda invoke \
      --function-name "$LAMBDA_NAME" \
      --payload '{"rawPath":"/api/import/fetch","requestContext":{"http":{"method":"POST","path":"/api/import/fetch"}}}' \
      --cli-binary-format raw-in-base64-out \
      /tmp/fetch-response.json; then
      echo "ERROR: Fetch Lambda invocation failed."
      exit 1
    fi
    python3 -c "import json; r=json.load(open('/tmp/fetch-response.json')); body=r.get('body','{}'); print(json.dumps(json.loads(body) if body else {}, indent=2))" || cat /tmp/fetch-response.json
    echo ""
    echo "=== Phase 2: Sync to Shop table ==="
    if ! aws lambda invoke \
      --function-name "$LAMBDA_NAME" \
      --payload '{"rawPath":"/api/import/sync","requestContext":{"http":{"method":"POST","path":"/api/import/sync"}}}' \
      --cli-binary-format raw-in-base64-out \
      --cli-read-timeout 300 \
      /tmp/sync-response.json; then
      echo "ERROR: Sync Lambda invocation failed."
      exit 1
    fi
    python3 -c "import json; r=json.load(open('/tmp/sync-response.json')); body=r.get('body','{}'); print(json.dumps(json.loads(body) if body else {}, indent=2))" || cat /tmp/sync-response.json
    ;;

  *)
    echo "ConsignCloud Import Script"
    echo ""
    echo "Usage:"
    echo "  $0 set-key <api-key>       Set the ConsignCloud API key in SSM"
    echo "  $0 fetch                   Fetch accounts from ConsignCloud into staging"
    echo "  $0 sync                    Sync staged accounts into the Shop table"
    echo "  $0 run                     Run both fetch and sync"
    echo ""
    echo "Environment variables:"
    echo "  ENVIRONMENT   Target environment (default: dev)"
    echo "  PROJECT_NAME  Project name (default: thymos)"
    ;;
esac
