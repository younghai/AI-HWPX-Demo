#!/usr/bin/env bash
# client/node_modules/@rhwp/core 가 비어 있을 때 symlink 생성.
#
# 왜 필요?
#   - vite dev 서버는 client/ 를 root 로 보므로 /node_modules/@rhwp/core/...
#     URL 을 client/node_modules/ 에서 찾는다 → 못 찾으면 SPA fallback (HTML)
#     반환 → wasm magic 불일치
#   - pnpm: client 의존성이라 client/node_modules/@rhwp/core 에 원래 존재 → no-op
#   - npm workspace: @rhwp/core 가 루트 node_modules/ 로 hoist 됨 → symlink 필요
#
# 사용:
#   bash scripts/setup-rhwp-symlink.sh
#
# 패키지 설치 후 항상 실행 권장 (postinstall 후크에 등록되어 있음).

set -e
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$REPO_ROOT/node_modules/@rhwp/core"
DST_DIR="$REPO_ROOT/client/node_modules/@rhwp"
DST="$DST_DIR/core"

# pnpm 레이아웃: client/node_modules/@rhwp/core 가 이미 해석 가능하면 그대로 사용
if [ -f "$DST/package.json" ]; then
  echo "✓ @rhwp/core 이미 존재: $DST (pnpm 레이아웃)"
  exit 0
fi

# npm hoist 레이아웃: 루트에서 client 로 symlink
if [ ! -d "$SRC" ]; then
  echo "✗ @rhwp/core 를 찾을 수 없습니다 ($DST, $SRC 모두 없음)."
  echo "  repo 루트에서 'pnpm install' 먼저 실행하세요."
  exit 1
fi

mkdir -p "$DST_DIR"
if [ -L "$DST" ] || [ -d "$DST" ]; then
  rm -rf "$DST"
fi
ln -s "$SRC" "$DST"
echo "✓ symlink: $DST → $SRC"
