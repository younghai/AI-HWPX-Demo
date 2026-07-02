#!/usr/bin/env bash
# polaris_dvc 바이너리를 v4/tools/bin/ 에 설치하는 one-time setup 스크립트.
#
# 요구: Rust 1.82+ (`cargo`/`rustc` PATH 에 있어야 함). macOS 는 `brew install rust`.
#
# 사용:
#   bash v4/scripts/setup-polaris-dvc.sh           # 기본 (clone + build)
#   FORCE=1 bash v4/scripts/setup-polaris-dvc.sh   # 기존 clone 재빌드
#
# 결과:
#   v4/tools/bin/polaris-dvc       (실행 파일)
#   v4/tools/polaris-dvc-spec.json (최소 RuleSpec {})
# 이후 v3 서버가 자동으로 감지해 병행 검증에 사용.

set -e

V3_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REPO_ROOT="$(cd "$V3_ROOT/.." && pwd)"
POLARIS_SRC="$REPO_ROOT/polaris_dvc"

if ! command -v cargo >/dev/null 2>&1; then
  echo "✗ cargo 가 설치되어 있지 않습니다. 'brew install rust' 후 재시도하세요."
  exit 1
fi

if [ ! -d "$POLARIS_SRC" ]; then
  echo "→ polaris_dvc clone: $POLARIS_SRC"
  git clone --depth=1 https://github.com/PolarisOffice/polaris_dvc.git "$POLARIS_SRC"
elif [ "${FORCE:-0}" = "1" ]; then
  echo "→ FORCE=1 — 기존 clone 에서 git pull"
  (cd "$POLARIS_SRC" && git pull --ff-only || true)
else
  echo "→ polaris_dvc 이미 clone 되어 있음 (재빌드만)"
fi

echo "→ cargo build --release -p polaris-dvc-cli"
(cd "$POLARIS_SRC" && cargo build --release -p polaris-dvc-cli)

SRC_BIN="$POLARIS_SRC/target/release/polaris-dvc"
DST_DIR="$V3_ROOT/tools/bin"
DST_BIN="$DST_DIR/polaris-dvc"

if [ ! -f "$SRC_BIN" ]; then
  echo "✗ 빌드된 바이너리를 찾을 수 없음: $SRC_BIN"
  exit 2
fi
mkdir -p "$DST_DIR"
cp "$SRC_BIN" "$DST_BIN"
chmod +x "$DST_BIN"
echo "✓ 설치: $DST_BIN"

SPEC_DST="$V3_ROOT/tools/polaris-dvc-spec.json"
if [ ! -f "$SPEC_DST" ]; then
  echo '{}' > "$SPEC_DST"
  echo "✓ 최소 RuleSpec 생성: $SPEC_DST"
fi

echo ""
echo "=== 설치 검증 ==="
"$DST_BIN" --help 2>&1 | head -3 || true
echo ""
echo "완료. v3 서버 재시작하면 validation 응답에 polaris-dvc engine 이 포함됩니다."
