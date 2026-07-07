#!/usr/bin/env bash
set -euo pipefail

HWPCONV_SHA=9af63ea5e24f4761351559591a1b35dbdf3c78b3
HWPCONV_REPO=https://github.com/vsdn/hwpConverter.git

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VENDOR_DIR="$ROOT_DIR/vendor/hwpconverter"
JAR_PATH="$VENDOR_DIR/hwpConverter.jar"
CONTAINER_NAME=hwpconv-build

force=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --force)
      force=1
      ;;
    -h|--help)
      echo "usage: $0 [--force]"
      exit 0
      ;;
    *)
      echo "usage: $0 [--force]" >&2
      exit 2
      ;;
  esac
  shift
done

if [ "$force" != "1" ] && [ -f "$JAR_PATH" ]; then
  echo "hwpConverter already present: $JAR_PATH"
  exit 0
fi

tmp="$(mktemp -d)"
src="$tmp/hwpConverter"

cleanup() {
  docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap cleanup EXIT

git clone --depth 1 "$HWPCONV_REPO" "$src"
if ! git -C "$src" checkout "$HWPCONV_SHA"; then
  git -C "$src" fetch --depth 1 origin "$HWPCONV_SHA"
  git -C "$src" checkout FETCH_HEAD
fi

docker run -d --name "$CONTAINER_NAME" --network none eclipse-temurin:8-jdk sleep 900 >/dev/null
docker cp "$src/." "$CONTAINER_NAME:/w"
docker exec -w /w "$CONTAINER_NAME" bash -c 'mkdir -p build/classes && find src -name "*.java" > build/sources.txt && javac -d build/classes -cp "lib/*" -encoding UTF-8 @build/sources.txt && jar cfm build/hwpConverter.jar build/MANIFEST.MF -C build/classes kr'

rm -rf "$VENDOR_DIR"
mkdir -p "$VENDOR_DIR/lib"
docker cp "$CONTAINER_NAME:/w/build/hwpConverter.jar" "$JAR_PATH"
docker cp "$CONTAINER_NAME:/w/lib/." "$VENDOR_DIR/lib"
cp "$src/LICENSE" "$VENDOR_DIR/LICENSE-hwpConverter"
cp "$ROOT_DIR/NOTICE" "$VENDOR_DIR/NOTICE"

echo "hwpConverter installed: $JAR_PATH"
