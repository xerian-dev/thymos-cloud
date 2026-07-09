#!/usr/bin/env bash
set -euo pipefail

# ConsignCloud Import Script
# Usage:
#   ./scripts/import-consigncloud.sh set-key <api-key>
#   ./scripts/import-consigncloud.sh accounts fetch
#   ./scripts/import-consigncloud.sh accounts sync
#   ./scripts/import-consigncloud.sh accounts run
#   ./scripts/import-consigncloud.sh items fetch [--created-after=YYYY-MM-DD]
#   ./scripts/import-consigncloud.sh items sync <job-id>
#   ./scripts/import-consigncloud.sh items run [--created-after=YYYY-MM-DD]
#   ./scripts/import-consigncloud.sh items status <job-id>
#   ./scripts/import-consigncloud.sh items resume <job-id>
#   ./scripts/import-consigncloud.sh items cancel <job-id>

ENVIRONMENT="${ENVIRONMENT:-dev}"
PROJECT_NAME="${PROJECT_NAME:-thymos}"
SSM_PATH="/${PROJECT_NAME}/${ENVIRONMENT}/consigncloud-api-key"
LAMBDA_NAME="${PROJECT_NAME}-${ENVIRONMENT}-shop-import"

parse_response() {
  local file="$1"
  python3 -c "import json; r=json.load(open('$file')); body=r.get('body','{}'); print(json.dumps(json.loads(body) if body else {}, indent=2))" || cat "$file"
}

cmd_set_key() {
  local api_key="${1:-}"
  if [[ -z "$api_key" ]]; then
    echo "Usage: $0 set-key <consigncloud-api-key>"
    exit 1
  fi
  echo "Setting ConsignCloud API key in SSM at ${SSM_PATH}..."
  aws ssm put-parameter \
    --name "$SSM_PATH" \
    --type SecureString \
    --value "$api_key" \
    --overwrite
  echo "Done."
}

cmd_accounts_fetch() {
  local payload='{"rawPath":"/api/import/fetch","requestContext":{"http":{"method":"POST","path":"/api/import/fetch"}}}'
  echo "Invoking accounts fetch Lambda: ${LAMBDA_NAME}..."
  if ! aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload "$payload" \
    --cli-binary-format raw-in-base64-out \
    /tmp/fetch-response.json; then
    echo "ERROR: Lambda invocation failed."
    exit 1
  fi
  echo ""
  echo "Response:"
  parse_response /tmp/fetch-response.json
}

cmd_accounts_sync() {
  local log_group="/aws/lambda/${LAMBDA_NAME}"
  local payload='{"rawPath":"/api/import/sync","requestContext":{"http":{"method":"POST","path":"/api/import/sync"}}}'

  echo "Invoking accounts sync Lambda: ${LAMBDA_NAME}..."

  # Start log tailing in background
  aws logs tail "$log_group" --follow --format short \
    --filter-pattern "Sync" 2>/dev/null &
  local tail_pid=$!

  if ! aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload "$payload" \
    --cli-binary-format raw-in-base64-out \
    --cli-read-timeout 300 \
    /tmp/sync-response.json; then
    kill "$tail_pid" 2>/dev/null || true
    echo "ERROR: Lambda invocation failed."
    exit 1
  fi

  kill "$tail_pid" 2>/dev/null || true
  wait "$tail_pid" 2>/dev/null || true

  echo ""
  echo "=== Final Result ==="
  parse_response /tmp/sync-response.json
}

cmd_accounts_run() {
  echo "=== Phase 1: Fetch accounts from ConsignCloud ==="
  cmd_accounts_fetch
  echo ""
  echo "=== Phase 2: Sync accounts to Shop table ==="
  cmd_accounts_sync
}

cmd_items_fetch() {
  local created_after=""
  for arg in "$@"; do
    case "$arg" in
      --created-after=*)
        created_after="${arg#--created-after=}"
        ;;
    esac
  done

  local body="{}"
  if [[ -n "$created_after" ]]; then
    # API requires full RFC 3339 date-time format with fractional seconds
    body="{\"createdAfter\":\"${created_after}T00:00:00.000Z\"}"
  fi

  local payload
  payload=$(printf '{"rawPath":"/api/import/items/start","requestContext":{"http":{"method":"POST","path":"/api/import/items/start"}},"body":"%s"}' "$(echo "$body" | sed 's/"/\\"/g')")

  echo "Starting item fetch phase..."
  if [[ -n "$created_after" ]]; then
    echo "  Filter: created after ${created_after}"
  fi

  if ! aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload "$payload" \
    --cli-binary-format raw-in-base64-out \
    /tmp/items-fetch-response.json; then
    echo "ERROR: Lambda invocation failed."
    exit 1
  fi
  echo ""
  echo "Response:"
  parse_response /tmp/items-fetch-response.json
}

cmd_items_sync_phase() {
  local job_id="${1:-}"
  if [[ -z "$job_id" ]]; then
    echo "Usage: $0 items sync <job-id>"
    exit 1
  fi

  local body="{\"jobId\":\"${job_id}\"}"
  local payload
  payload=$(printf '{"rawPath":"/api/import/items/sync","requestContext":{"http":{"method":"POST","path":"/api/import/items/sync"}},"body":"%s"}' "$(echo "$body" | sed 's/"/\\"/g')")

  echo "Starting item sync phase for job: ${job_id}..."
  if ! aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload "$payload" \
    --cli-binary-format raw-in-base64-out \
    /tmp/items-sync-response.json; then
    echo "ERROR: Lambda invocation failed."
    exit 1
  fi
  echo ""
  echo "Response:"
  parse_response /tmp/items-sync-response.json
}

cmd_items_run() {
  echo "=== Phase 1: Fetch items from ConsignCloud ==="
  cmd_items_fetch "$@"
  echo ""
  echo "Fetch phase kicked off. Use 'items status <job-id>' to monitor."
  echo "Once fetch completes (job state = paused), run 'items sync <job-id>' to start the sync phase."
}

cmd_items_status() {
  local job_id="${1:-}"
  if [[ -z "$job_id" ]]; then
    echo "Usage: $0 items status <job-id>"
    exit 1
  fi

  local body="{\"jobId\":\"${job_id}\"}"
  local payload
  payload=$(printf '{"rawPath":"/api/import/items/status","requestContext":{"http":{"method":"POST","path":"/api/import/items/status"}},"body":"%s"}' "$(echo "$body" | sed 's/"/\\"/g')")

  echo "Checking item import status for job: ${job_id}..."
  if ! aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload "$payload" \
    --cli-binary-format raw-in-base64-out \
    /tmp/items-status-response.json; then
    echo "ERROR: Lambda invocation failed."
    exit 1
  fi
  echo ""
  echo "Response:"
  parse_response /tmp/items-status-response.json
}

cmd_items_resume() {
  local job_id="${1:-}"
  if [[ -z "$job_id" ]]; then
    echo "Usage: $0 items resume <job-id>"
    exit 1
  fi

  local body="{\"jobId\":\"${job_id}\"}"
  local payload
  payload=$(printf '{"rawPath":"/api/import/items/resume","requestContext":{"http":{"method":"POST","path":"/api/import/items/resume"}},"body":"%s"}' "$(echo "$body" | sed 's/"/\\"/g')")

  echo "Resuming item import for job: ${job_id}..."
  if ! aws lambda invoke \
    --function-name "$LAMBDA_NAME" \
    --payload "$payload" \
    --cli-binary-format raw-in-base64-out \
    /tmp/items-resume-response.json; then
    echo "ERROR: Lambda invocation failed."
    exit 1
  fi
  echo ""
  echo "Response:"
  parse_response /tmp/items-resume-response.json
}

cmd_items_cancel() {
  local job_id="${1:-}"
  if [[ -z "$job_id" ]]; then
    echo "Usage: $0 items cancel <job-id>"
    exit 1
  fi

  local table_name="${PROJECT_NAME}-${ENVIRONMENT}-import"

  echo "Cancelling item import job: ${job_id}..."
  echo "  Deleting job record from ${table_name}..."

  aws dynamodb delete-item \
    --table-name "$table_name" \
    --key "{\"PK\": {\"S\": \"ITEM_IMPORT#${job_id}\"}, \"SK\": {\"S\": \"METADATA\"}}"

  echo "  Deleting checkpoint (if exists)..."
  aws dynamodb delete-item \
    --table-name "$table_name" \
    --key "{\"PK\": {\"S\": \"ITEM_IMPORT#${job_id}\"}, \"SK\": {\"S\": \"CHECKPOINT\"}}"

  echo "Done. Job ${job_id} has been cancelled."
}

show_help() {
  echo "ConsignCloud Import Script"
  echo ""
  echo "Usage:"
  echo "  $0 set-key <api-key>                          Set the ConsignCloud API key in SSM"
  echo ""
  echo "  $0 accounts fetch                             Fetch accounts from ConsignCloud into staging"
  echo "  $0 accounts sync                              Sync staged accounts into the Shop table"
  echo "  $0 accounts run                               Run both fetch and sync"
  echo ""
  echo "  $0 items fetch [--created-after=YYYY-MM-DD]   Fetch items from ConsignCloud into staging"
  echo "  $0 items sync <job-id>                        Sync staged items into the Shop table"
  echo "  $0 items run [--created-after=YYYY-MM-DD]     Start fetch (use sync after fetch completes)"
  echo "  $0 items status <job-id>                      Check status of an item import job"
  echo "  $0 items resume <job-id>                      Resume a paused/failed item import job"
  echo "  $0 items cancel <job-id>                      Cancel a paused/failed job (deletes from DB)"
  echo ""
  echo "Environment variables:"
  echo "  ENVIRONMENT   Target environment (default: dev)"
  echo "  PROJECT_NAME  Project name (default: thymos)"
}

# --- Main dispatch ---

case "${1:-help}" in
  set-key)
    shift
    cmd_set_key "$@"
    ;;

  accounts)
    subcmd="${2:-help}"
    case "$subcmd" in
      fetch) cmd_accounts_fetch ;;
      sync)  cmd_accounts_sync ;;
      run)   cmd_accounts_run ;;
      *)
        echo "Usage: $0 accounts {fetch|sync|run}"
        exit 1
        ;;
    esac
    ;;

  items)
    subcmd="${2:-help}"
    case "$subcmd" in
      fetch)
        shift 2
        cmd_items_fetch "$@"
        ;;
      sync)
        cmd_items_sync_phase "${3:-}"
        ;;
      run)
        shift 2
        cmd_items_run "$@"
        ;;
      status)
        cmd_items_status "${3:-}"
        ;;
      resume)
        cmd_items_resume "${3:-}"
        ;;
      cancel)
        cmd_items_cancel "${3:-}"
        ;;
      *)
        echo "Usage: $0 items {fetch|sync|run|status|resume|cancel}"
        exit 1
        ;;
    esac
    ;;

  *)
    show_help
    ;;
esac
