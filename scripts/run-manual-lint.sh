#!/usr/bin/env bash

# Kiem tra code thu cong cho Mailbox (Svelte 5 + TypeScript + Vite)
# - oxlint: quy tac JS/TS nhanh
# - svelte-check + tsc: kiem tra kieu Svelte/TypeScript

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
LINT_RESULT_FILE="$SCRIPT_DIR/lint-results.json"
CHECK_LOG_FILE="$SCRIPT_DIR/check-results.log"

OXLINT_EXIT=0
CHECK_EXIT=0

echo "=================================================="
echo "Mailbox - Kiem tra code thu cong"
echo "Thu muc du an: $PROJECT_ROOT"
echo "=================================================="

cd "$PROJECT_ROOT" || exit 1

if [ ! -d "src" ]; then
  echo "Khong tim thay thu muc src trong $PROJECT_ROOT"
  exit 1
fi

if [ ! -f "package.json" ]; then
  echo "Khong tim thay package.json trong $PROJECT_ROOT"
  exit 1
fi

echo ""
echo "[1/2] oxlint - phan tich src/"
echo "--------------------------------------------------"
npx -y oxlint@latest "$PROJECT_ROOT/src"
OXLINT_EXIT=$?

echo ""
echo "[2/2] svelte-check + tsc - kiem tra kieu"
echo "--------------------------------------------------"
if npm run check >"$CHECK_LOG_FILE" 2>&1; then
  CHECK_EXIT=0
  cat "$CHECK_LOG_FILE"
else
  CHECK_EXIT=$?
  cat "$CHECK_LOG_FILE"
fi

echo ""
echo "=================================================="

if [ $OXLINT_EXIT -eq 0 ] && [ $CHECK_EXIT -eq 0 ]; then
  echo "Ket qua: CODE SACH - khong phat hien loi."
  echo "=================================================="
  rm -f "$LINT_RESULT_FILE" "$CHECK_LOG_FILE"
  exit 0
fi

echo "Ket qua: PHAT HIEN VAN DE"
[ $OXLINT_EXIT -ne 0 ] && echo "  - oxlint:      FAILED (exit $OXLINT_EXIT)"
[ $CHECK_EXIT -ne 0 ] && echo "  - type check:  FAILED (exit $CHECK_EXIT)"
echo "=================================================="

if [ $OXLINT_EXIT -ne 0 ]; then
  echo "Dang tao bao cao oxlint JSON: scripts/lint-results.json"
  npx -y oxlint@latest "$PROJECT_ROOT/src" -f json >"$LINT_RESULT_FILE" 2>/dev/null || true
fi

if [ $CHECK_EXIT -ne 0 ]; then
  echo "Log kiem tra kieu: scripts/check-results.log"
fi

if [ $OXLINT_EXIT -ne 0 ] && command -v jq >/dev/null 2>&1 && [ -f "$LINT_RESULT_FILE" ]; then
  TOTAL_ISSUES=$(jq 'length' "$LINT_RESULT_FILE" 2>/dev/null || echo "?")
  echo "Tong so van de oxlint (theo file): $TOTAL_ISSUES"
fi

FINAL_EXIT=0
[ $OXLINT_EXIT -ne 0 ] && FINAL_EXIT=$OXLINT_EXIT
[ $CHECK_EXIT -ne 0 ] && FINAL_EXIT=$CHECK_EXIT

exit $FINAL_EXIT
