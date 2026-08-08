# Tasks: Color/Pattern Split

## Phase 1: Pattern Detection Logic

- [x] 1. Create `src/patterns/scan-cluster.ts`
  - Pattern detection map (German canonical patterns + variants)
  - Splitting algorithm: pure pattern / compound / substring detection
  - Scan items with color values, identify which contain patterns
  - Output format: `[{ raw, color, pattern }]`
  - Write draft to `s3://bucket/pattern-mappings/draft.json`

- [x] 2. Create `pattern-cluster-handler.ts` entry point

## Phase 2: Apply Logic

- [x] 3. Create `src/patterns/apply-mappings.ts`
  - Read draft from S3, diff against applied
  - For each item: set `pattern` field, update `color` field (remove pattern portion), preserve `sourcePattern`
  - Handle null color case (REMOVE color when value was pure pattern)
  - Write status to S3, snapshot applied.json

- [x] 4. Create `pattern-apply-handler.ts` entry point

## Phase 3: API Routes

- [x] 5. Create `src/routes/pattern-management.ts`
  - `POST /api/patterns/scan-cluster` — trigger async Lambda
  - `GET /api/patterns/mappings` — load draft from S3
  - `PUT /api/patterns/mappings` — save edited draft to S3
  - `POST /api/patterns/apply` — trigger async apply Lambda
  - `GET /api/patterns/apply-status` — poll status

- [x] 6. Register routes in router.ts

## Phase 4: Infrastructure

- [x] 7. Add `pattern-cluster` Lambda to Terraform
  - Same role as other cleanup Lambdas (pricing-aggregator role)
  - 900s timeout, 1024MB memory
  - Env vars: TABLE_NAME, BUCKET_NAME

- [x] 8. Add `pattern-apply` Lambda to Terraform

- [x] 9. Add S3 permissions for `pattern-mappings/*` prefix
  - On both pricing-aggregator role and shop-api role

- [x] 10. Add API Gateway routes for all 5 pattern endpoints

- [x] 11. Add Lambda invoke permission (shop-api → pattern-cluster, pattern-apply)

- [x] 12. Add env vars to shop-api Lambda
  - `PATTERN_CLUSTER_FUNCTION_NAME`
  - `PATTERN_APPLY_FUNCTION_NAME`

## Phase 5: Frontend

- [x] 13. Create `src/features/patterns/` in shop frontend
  - `patterns-types.ts` — PatternMapping interface (raw, color, pattern)
  - `patterns-api.ts` — API client functions
  - `pattern-management-page.tsx` — virtualized table with 3 columns (Raw, Color, Pattern)

- [x] 14. Add navigation entry ("Patterns" with appropriate icon)

- [x] 15. Add route in routes.ts

## Phase 6: Build & Deploy

- [x] 16. Add entry points to esbuild.config.mjs

- [x] 17. Verify TypeScript compilation (shop-api + shop)

- [x] 18. Verify Terraform validates

## Phase 7: Post-Split Cleanup

- [x] 19. Update color scan/cluster to exclude pattern values
  - After pattern-apply has run, re-run color scan/cluster
  - Pattern values should no longer appear in color drafts
  - Verify color-mappings/draft.json is pattern-free

- [x] 20. Update data-model.md
  - Add `pattern` field to Item entity
  - Document canonical pattern values

## Phase 8: Testing

- [x] 21. Unit tests for splitting algorithm
  - Pure pattern → color null, pattern set
  - Compound → both color and pattern extracted
  - Pure color → pattern null
  - Substring detection
  - Edge cases (empty, null, numbers)

- [x] 22. Unit tests for pattern-apply
  - Delta computation
  - REMOVE color when pure pattern
  - SET both when compound
  - Idempotency (sourcePattern not overwritten)
