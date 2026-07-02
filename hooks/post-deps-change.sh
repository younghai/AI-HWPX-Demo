#!/usr/bin/env bash
# post-deps-change.sh
#
# Run me right after modifying package.json or installing packages.
# Ensures dev server / cache doesn't hold stale module graph (R3 in CLAUDE.md).
#
# Usage:
#   bash hooks/post-deps-change.sh

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== 1. Dev 서버 종료 ==="
pkill -f 'vite' 2>/dev/null && echo "  ✓ vite killed" || echo "  · vite 미실행"
pkill -f 'server/index.js' 2>/dev/null && echo "  ✓ express killed" || echo "  · express 미실행"
pkill -f 'concurrently' 2>/dev/null && echo "  ✓ concurrently killed" || echo "  · concurrently 미실행"
sleep 1

echo ""
echo "=== 2. Vite cache 삭제 ==="
for d in "$REPO_ROOT/client/node_modules/.vite" "$REPO_ROOT/node_modules/.vite"; do
  if [ -d "$d" ]; then
    rm -rf "$d"
    echo "  ✓ removed $d"
  else
    echo "  · $d 없음"
  fi
done

echo ""
echo "=== 3. 설치된 rhwp 버전 확인 ==="
for pj in "$REPO_ROOT/node_modules/@rhwp/core/package.json" "$REPO_ROOT/client/node_modules/@rhwp/core/package.json"; do
  if [ -f "$pj" ]; then
    V=$(python3 -c "import json; print(json.load(open('$pj'))['version'])" 2>/dev/null || echo "?")
    echo "  · $pj → $V"
  fi
done

echo ""
echo "=== 4. 다음 단계 ==="
cat <<'NEXT'
  1. 'pnpm run dev' 로 재기동
  2. 브라우저에서 Cmd+Shift+R (하드 리프레시)
  3. 'bash tools/smoke-test.sh' 로 확인
NEXT
