#!/usr/bin/env bash
# Full verification against the TEST database (never the development one):
#   1. Vitest (unit + integration; resets dataroom_test)
#   2. production build + test server on :3100 + worker
#   3. Playwright (HTTP security + full admin/recipient walkthrough)
# Optional external services: moto S3 (S3_TEST_ENDPOINT) and clamd with EICAR test DB (CLAMD_TEST_PORT).
set -euo pipefail
cd "$(dirname "$0")/.."
npx vitest run
npx next build
set -a; . ./.env.test.local; set +a; export APP_URL=http://localhost:3100
npx next start -p 3100 > .local/test-server.log 2>&1 & WEB=$!
ENV_FILE=.env.test.local node --conditions=react-server --import tsx scripts/worker.ts > .local/test-worker.log 2>&1 & WRK=$!
trap 'kill $WEB $WRK 2>/dev/null || true' EXIT
for i in $(seq 1 30); do curl -sf -o /dev/null http://localhost:3100/access && break; sleep 1; done
E2E_PORT=3100 ENV_FILE=.env.test.local npx playwright test --trace off
