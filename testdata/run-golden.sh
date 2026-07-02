#!/usr/bin/env bash
# v3 골든 테스트 러너.
#
# 사용:
#   bash v4/testdata/run-golden.sh                # 모든 케이스 실행
#   bash v4/testdata/run-golden.sh 01-minimal-report  # 특정 케이스만
#
# 요구: dev 서버가 기동 중이어야 함 (`cd v3 && npm run dev`).
# 동작:
#   1. 각 케이스의 input.json 을 /api/export-hwpx 로 POST
#   2. 다운로드한 HWPX 에 대해 expected.markers_present / markers_each_exact_count /
#      template_leaks_forbidden / validation_error_count_max 기준으로 통과 여부 판정
#   3. exit 0 (모두 통과) 또는 1 (하나라도 실패)
#
# polaris_dvc 의 testdata/golden/ 패턴에서 차용. 한컴 DVC 와 달리
# expected HWPX 바이트 비교는 하지 않는다 (타임스탬프 기반 파일명 때문).

set -u
V3_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CASES_DIR="$V3_ROOT/testdata/golden"
SERVER_URL="${SERVER_URL:-http://127.0.0.1:8792}"

FILTER="${1:-}"
FAILED=0
TOTAL=0
PASSED=0

run_case() {
    local case_dir="$1"
    local name
    name="$(basename "$case_dir")"
    if [ -n "$FILTER" ] && [ "$name" != "$FILTER" ]; then
        return 0
    fi
    local input_json="$case_dir/input.json"
    if [ ! -f "$input_json" ]; then
        echo "  ⊘ $name — input.json 없음, 스킵"
        return 0
    fi

    TOTAL=$((TOTAL + 1))
    echo ""
    echo "── case: $name ──"

    local tmp; tmp="$(mktemp -d)"
    trap "rm -rf '$tmp'" RETURN

    # input.json 파싱
    local title toc sections diagrams template
    title=$(python3 -c "import json; d=json.load(open('$input_json')); print(d['request']['title'])")
    toc=$(python3 -c "import json; d=json.load(open('$input_json')); print('\n'.join(d['request']['toc']))")
    sections=$(python3 -c "import json; d=json.load(open('$input_json')); print(json.dumps(d['request']['sections'], ensure_ascii=False))")
    diagrams=$(python3 -c "import json; d=json.load(open('$input_json')); print(json.dumps(d['request'].get('diagrams', []), ensure_ascii=False))")
    template=$(python3 -c "import json; d=json.load(open('$input_json')); print(d['request']['templateRelPath'])")

    # POST
    curl -sS -X POST "$SERVER_URL/api/export-hwpx" \
        -F "title=$title" \
        -F "toc=$toc" \
        -F "sections=$sections" \
        -F "diagrams=$diagrams" \
        -F "sourceMode=hwpx-template" \
        -F "sourceFile=@$V3_ROOT/$template" > "$tmp/resp.json"

    local ok
    ok=$(python3 -c "import json; print(json.load(open('$tmp/resp.json')).get('ok', False))")
    if [ "$ok" != "True" ]; then
        echo "  ✗ API 응답 ok=false"
        cat "$tmp/resp.json"
        FAILED=$((FAILED + 1))
        return 1
    fi

    local url
    url=$(python3 -c "import json; print(json.load(open('$tmp/resp.json'))['downloadUrl'])")
    curl -sS "$SERVER_URL$url" -o "$tmp/out.hwpx"

    # 판정
    python3 - "$input_json" "$tmp/resp.json" "$tmp/out.hwpx" <<'PYEOF'
import json, sys, zipfile, xml.etree.ElementTree as ET
input_json, resp_json, hwpx = sys.argv[1], sys.argv[2], sys.argv[3]
exp = json.load(open(input_json))['expected']
resp = json.load(open(resp_json))

# HWPX 본문 텍스트 추출
HP = 'http://www.hancom.co.kr/hwpml/2011/paragraph'
texts = []
with zipfile.ZipFile(hwpx) as z:
    for name in z.namelist():
        if name.startswith('Contents/section') and name.endswith('.xml'):
            root = ET.fromstring(z.read(name))
            for t in root.iter(f'{{{HP}}}t'):
                if t.text and t.text.strip():
                    texts.append(t.text.strip())
full = '\n'.join(texts)

errors = []

# 1. markers_present — 각각 exact_count 만큼 있는가
want_count = exp.get('markers_each_exact_count', 1)
for m in exp.get('markers_present', []):
    c = full.count(m)
    if c != want_count:
        errors.append(f"marker '{m}' expected {want_count}x, got {c}x")

# 2. template_leaks_forbidden — 하나도 없어야 함
for leak in exp.get('template_leaks_forbidden', []):
    c = full.count(leak)
    if c > 0:
        errors.append(f"template leak '{leak}' appears {c}x (should be 0)")

# 3. validation_error_count_max
v = resp.get('validation', {})
max_err = exp.get('validation_error_count_max', 0)
actual = v.get('errorCount', 0)
if actual > max_err:
    errors.append(f"validation errors {actual} > max {max_err}")

if errors:
    print("  ✗ 실패:")
    for e in errors: print(f"     - {e}")
    sys.exit(1)
else:
    print("  ✓ 통과")
    sys.exit(0)
PYEOF

    if [ $? -eq 0 ]; then
        PASSED=$((PASSED + 1))
    else
        FAILED=$((FAILED + 1))
    fi
    rm -rf "$tmp"
    trap - RETURN
}

echo "=== v3 Golden Test ==="
echo "server: $SERVER_URL"

for case_dir in "$CASES_DIR"/*/; do
    run_case "$case_dir"
done

echo ""
echo "────────────────────────────"
if [ "$FAILED" -eq 0 ]; then
    echo -e "\033[32m✓ 모두 통과 ($PASSED / $TOTAL)\033[0m"
    exit 0
else
    echo -e "\033[31m✗ $FAILED 건 실패 ($PASSED / $TOTAL 통과)\033[0m"
    exit 1
fi
