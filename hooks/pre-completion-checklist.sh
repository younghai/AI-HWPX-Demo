#!/usr/bin/env bash
# pre-completion-checklist.sh
#
# Rule R1 (CLAUDE.md): "완료" 라고 선언하기 전에 반드시 돌린다.
# 실패 항목이 있으면 사용자에게 완료라고 말하지 말 것.
#
# Usage:
#   bash hooks/pre-completion-checklist.sh
#
# Exit 0 = 완료 선언해도 OK
# Exit 1 = 회귀/누락 있음 — 사용자에게 실패 보고
#
# 자립형: 모든 경로가 repo 루트 내부로 해결된다.

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

pass() { printf "  \033[32m✓\033[0m %s\n" "$1"; }
fail() { printf "  \033[31m✗\033[0m %s\n" "$1"; FAILED=1; }

FAILED=0

echo "=== Python syntax (scripts/) ==="
if python3 -m py_compile scripts/build_hwpx.py 2>/dev/null; then
  pass "scripts/build_hwpx.py"
else
  fail "scripts/build_hwpx.py syntax error"
fi
for opt in scripts/clone_form.py scripts/fix_namespaces.py; do
  if [ -f "$opt" ]; then
    if python3 -m py_compile "$opt" 2>/dev/null; then
      pass "$opt"
    else
      fail "$opt syntax error"
    fi
  fi
done

echo ""
echo "=== Server module syntax ==="
CNT=0; BAD=0
for f in server/index.js server/lib/*.js server/services/*.js server/routes/*.js; do
  CNT=$((CNT+1))
  if ! node --check "$f" 2>/dev/null; then
    fail "$f"
    BAD=$((BAD+1))
  fi
done
[ "$BAD" = "0" ] && pass "$CNT files" || fail "$BAD / $CNT files failed"

echo ""
echo "=== Shared module syntax ==="
for f in shared/*.js; do
  if node --check "$f" 2>/dev/null; then
    pass "$(basename $f)"
  else
    fail "$f"
  fi
done

echo ""
echo "=== Client production build ==="
if (cd client && pnpm run build 2>&1 | tail -5 | grep -q 'built in'); then
  pass "vite build"
else
  fail "vite build"
fi

echo ""
echo "=== Dev server running? (required for E2E) ==="
if lsof -nP -i:5192 -i:8792 2>/dev/null | grep -q LISTEN; then
  pass "server 포트 listening"
  echo ""
  echo "=== E2E smoke test (API → HWPX → markers) ==="
  if bash "$REPO_ROOT/tools/smoke-test.sh" > /tmp/ai-hwp-smoke.log 2>&1; then
    pass "smoke-test.sh PASS"
  else
    fail "smoke-test.sh FAIL — 자세한 로그: /tmp/ai-hwp-smoke.log"
    tail -20 /tmp/ai-hwp-smoke.log | sed 's/^/      /'
  fi
else
  fail "dev 서버가 꺼져 있음 — E2E 생략. 'pnpm run dev' 후 재실행."
fi

echo ""
if [ "${FAILED:-0}" = "0" ]; then
  echo -e "\033[32m=== READY TO DECLARE DONE ===\033[0m"
  exit 0
else
  echo -e "\033[31m=== NOT READY — 위 실패 항목 수정 후 재실행 ===\033[0m"
  exit 1
fi
