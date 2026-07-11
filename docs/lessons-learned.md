# Lessons Learned — v4

실제로 터진 문제만 기록. 추측, "~할 것 같다"는 금지. 각 항목은:
- **What happened** (현상)
- **Why** (근본 원인)
- **Fix** (실제 적용한 해결책)
- **Prevention** (다음 번 재발 방지 장치 — `skills/`, `hooks/`, `CLAUDE.md` 업데이트 경로)

---

## 2026-07-11 — 첫 CI 가동이 11초 만에 EACCES로 즉사 (.npmrc 맥 전용 절대경로)

### What happened
- GitHub Actions 첫 런이 `pnpm/action-setup` 단계에서 `EACCES: permission denied, mkdir '/Users'`로 실패

### Why
- 로컬 워크스페이스 정책이 커밋된 `.npmrc`에 `store-dir=/Users/young/.../.pnpm-store`(맥 전용 절대경로)를 넣는데, Linux 러너에는 `/Users`가 없음. action-setup의 self-installer조차 repo `.npmrc`를 읽어서 setup 단계부터 죽음 — 이 repo가 로컬 전용일 때는 무해했지만 공개 repo+CI가 되는 순간 터지는 부류

### Fix
- ci.yml에 checkout 직후 `.npmrc`를 러너 로컬 store로 덮어쓰는 스텝 추가 (8bbe2a8) — 로컬 정책 파일은 그대로 유지

### Prevention
- 머신 절대경로가 커밋 파일에 들어가면 "이 repo가 다른 머신에서 돌 때"를 항상 질문할 것
- 새 프로젝트를 공개/CI로 올릴 때 `.npmrc`·설정 파일의 절대경로 스캔을 선행

---

## 2026-07-11 — 첫 git push가 HTTP 400 sideband 중단으로 실패 (repo 6.9MiB인데도)

### What happened
- `git push -u origin phase-abc-2026-07-03` 첫 시도가 `RPC failed; HTTP 400 curl 22` + `unexpected disconnect while reading sideband packet`으로 실패

### Why
- git은 push 본문이 `http.postBuffer`(기본 1MB)를 넘으면 chunked transfer-encoding으로 전환하는데, 이 환경의 HTTPS 경로가 chunked POST를 400으로 거부 — pack이 1MB만 넘으면 repo가 작아도(6.9MiB) 동일하게 터짐

### Fix
- `git config http.postBuffer 104857600` (repo-local) 후 재시도 → Content-Length 방식으로 전송돼 성공

### Prevention
- 이 repo에는 이미 로컬 config로 박아둠. 새 클론에서 같은 증상이 나오면 위 한 줄 먼저 적용
- 400/sideband 증상을 인증 문제(401/403 아님)나 용량 제한(GitHub 2GB 아님)으로 오진하지 말 것

---

## 2026-07-06 — golden 러너가 macOS 기본 bash 3.2에서 즉사 (샌드박스 구현자는 못 잡는 부류)

### What happened
- golden 03 추가 커밋(0d96362) 직후 라이브 실행에서 `extra_args[@]: unbound variable`로 러너 전체 실패

### Why
- `set -u` + **빈 배열** `"${extra_args[@]}"` 확장은 bash 4.4 미만(macOS 기본 /bin/bash = 3.2)에서 unbound 에러 — 구현자(Codex)는 샌드박스에서 소켓 바인딩이 막혀 라이브로 못 돌리고 `bash -n`(문법만)으로 검증했기 때문에 통과처럼 보였음

### Fix
- `${extra_args[@]+"${extra_args[@]}"}` 관용구로 교체 (043eaa8)

### Prevention
- 러너/서버 스크립트 변경은 반드시 **감사자가 라이브 실행**으로 닫는다 — `bash -n`은 배열/`set -u` 상호작용을 못 잡는다
- bash 스크립트에서 배열을 옵션 인자로 쓸 때는 처음부터 `${arr[@]+"${arr[@]}"}` 패턴 사용

---

## 2026-07-05 — 다이어그램 폰트/색상이 cairosvg 폴백에서만 깨짐 (파리티 테스트로 못 잡음)

### What happened
- diagram-quality 브랜치 병합 후 실제 API로 다이어그램 임베드를 검증하던 중, cairosvg 경로(클라이언트 PNG 미업로드 시 폴백)로 렌더된 PNG에서:
  1. 한글이 전부 tofu(빈 네모)로 깨짐 — 숫자/영문만 정상
  2. flowchart 강조 박스·comparison 강조 컬럼의 텍스트가 배경과 같은 색으로 보이지 않음
- D3 파리티 테스트(client JS ↔ python SVG 마크업 diff)는 두 렌더러의 텍스트/폰트 선언 문자열이 동일함만 확인해 통과했지만, **같은 마크업을 두 엔진이 다르게 rasterize** 하는 경우는 못 잡는다는 것이 드러남

### Why
1. **폰트**: `FONT` 상수가 `'Pretendard', 'Apple SD Gothic Neo', ...` 순서였는데, cairosvg는 브라우저처럼 CSS font-family 목록을 캐스케이딩하지 않고 **첫 번째 이름만** fontconfig로 조회 → 실패하면 (Pretendard는 어디에도 실제 설치/로드된 적 없는 이름) fontconfig 기본 폰트로 조용히 대체되는데 그 기본 폰트에 한글 글리프가 없음. 목록의 2번째인 'Apple SD Gothic Neo'(fontconfig에 실존)는 아예 시도되지 않음
2. **색상**: `fill="{ACCENT}22"` 같은 8자리 hex 알파(CSS Color 4)를 cairosvg가 지원하지 않아 완전 불투명으로 렌더 → 강조색 텍스트가 이제 막 불투명해진 동일 강조색 배경과 겹쳐 안 보임. 같은 파일에 이미 있던 `rgba(28,25,23,0.12)` 표기는 정상 작동(작성자가 이미 알고 있던 안전한 패턴이었는데 3곳에서만 축약형을 씀)

### Fix
- `scripts/diagram_templates.py` + `client/src/lib/diagrams.js` (동일하게):
  - `FONT`를 fontconfig에서 실존 확인된 `'Apple SD Gothic Neo'`가 맨 앞에 오도록 재정렬 (브라우저는 순서 무관하게 캐스케이딩하므로 무해)
  - `fill="{ACCENT}NN"` 3곳을 `fill="{ACCENT}" fill-opacity="0.NN"` (필요시 `stroke-opacity`)로 교체 — SVG 1.1 코어라 두 엔진에서 동일하게 렌더
- 실제 `/api/export-hwpx` 호출로 flowchart+comparison 임베드 PNG를 추출해 육안 확인 (한글 정상, 강조 틴트 정상)

### Prevention
- D3 파리티 테스트는 "마크업 동일"만 보장하고 "두 엔진이 같은 픽셀을 그린다"는 보장하지 않는다는 한계를 인지 — 새 SVG 속성/색상 문법을 diagram_templates.py/diagrams.js에 추가할 때는 **cairosvg가 지원하는 SVG 1.1 코어 속성인지** 먼저 확인 (8자리 hex, CSS Color 4 함수 등은 피하고 `fill-opacity`/`rgba()` 사용)
- ~~미검증 잔여 리스크~~ **→ 2026-07-06 실측 통과**: `docker build` 후 컨테이너 안에서 실제 `/api/export-hwpx` 다이어그램 임베드 → BinData PNG 추출 → 육안 확인 완료. Linux(fonts-noto-cjk)에서는 fontconfig가 미설치 1순위 폰트('Apple SD Gothic Neo')를 Noto CJK로 substitution해 한글이 정상 렌더됨 (macOS의 실패 모드와 다름). 현재 FONT 스택은 macOS·Linux 컨테이너 양쪽 실측 통과

---

## 2026-07-04 — 정본 템플릿의 폰트 안내 문구가 모든 생성 문서에 부제로 노출

### What happened
- 브라우저 QA에서 생성 문서 제목 바로 아래 "폰트 HY헤드라인M, 크기 18" 부제가 미리보기·다운로드 바이트 모두에서 발견
- `templates/gonmun.hwpx`(정본) + 샘플 4종 전부 해당 → 모든 생성 경로에서 누수

### Why
- gonmun.hwpx 제목 블록 2번째 문단이 원본 한글 양식의 "작성 안내" 텍스트
- `apply_smart_replacements` 분류(제목/메타/헤딩/본문) 어디에도 속하지 않는 unmapped 문단이라 빌드가 손대지 않고 그대로 통과

### Fix
- 정본 zip에서 해당 t-node 텍스트만 비움 (문단 구조·lineseg 보존 — 빈 문단은 분류 루프에서 스킵되므로 안전) + `Preview/PrvText.txt` 동일 정리
- `gonmun-sample.hwpx` 재복사 + report/proposal/minutes 샘플 재생성 (`gen_sample_templates.py`, 결정적)

### Prevention
- `scripts/tests/test_pipeline.py::test_shipped_templates_have_no_font_guide_boilerplate` — 출고 템플릿 5종의 전 zip 엔트리 스캔
- 기존 parity 테스트에도 해당 문구 부재 assert 추가 (`CLAUDE.md` R5 실수 이력 갱신)

---

## 2026-04-26 — v4 문서에 v2/v3 버전 식별자 잔여

### What happened
- `v4/README.md` L1: `# v3 — AI Document Studio`
- `v4/CLAUDE.md` L1: `# v2 — AI Document Studio`
- 서비스기획서, SRS, lessons-learned 모두 v2/v3으로 표기

### Why
- v3에서 v4로 복사하면서 버전 식별자를 일괄 변경하지 않음

### Fix
- README.md, CLAUDE.md, 서비스기획서, SRS, lessons-learned의 모든 버전 식별자를 v4로 수정
- 포트 번호, 폴더 구조, 컴포넌트 목록을 v4 실제 코드에 맞게 업데이트

### Prevention
- 버전 업그레이드 시 `grep -rn "v2\|v3" v4/` 로 잔여 식별자 스캔 필수
- `hooks/pre-completion-checklist.sh`에 버전 식별자 일관성 체크 추가 고려

---

## 2026-04-26 — @rhwp/core ^0.7.2 사용으로 ADR-0001 위반

### What happened
- `v4/client/package.json`에서 `"@rhwp/core": "^0.7.2"` 사용
- ADR-0001은 exact pin만 허용, caret 금지

### Why
- v4 개발 시 ADR-0001 규칙을 인지하지 못한 상태에서 semver 범위 지정

### Fix
- `"@rhwp/core": "0.7.2"` (exact pin)으로 변경

### Prevention
- `hooks/post-deps-change.sh`에 `grep '"\^"' client/package.json` 체크 추가 고려

---

## 2026-04-26 — postinstall || true 로 설치 에러 음소거

### What happened
- `v4/package.json` postinstall에 `|| true` 추가
- setup-rhwp-symlink.sh 실패해도 npm install이 성공으로 표시됨

### Why
- 개발 중 빠른 설치를 위해 에러를 숨김

### Fix
- `|| true` 제거. 실패 시 명확하게 에러 노출

### Prevention
- postinstall 스크립트는 에러를 숨기지 않는다. 필요시 스크립트 내에서 graceful 처리

---

## 2026-04-26 — useDraft fetch 경쟁 조건 (race condition)

### What happened
- AI 초안 생성 버튼 연속 클릭 시 이전 응답이 최신 응답을 덮어씀
- AbortController 없이 fetch 호출

### Why
- useDraft hook에서 각 fetch에 signal 전달하지 않음

### Fix
- `useRef`로 AbortController 저장
- 각 fetch 호출 전 이전 요청 abort
- AbortError는 사용자에게 표시하지 않음

### Prevention
- 모든 async hook에서 AbortController 패턴 필수 적용

---

## 2026-04-26 — LoginOverlay 접근성 위반 (WCAG 2.4.3)

### What happened
- 로그인 오버레이 오픈 시 Tab 키가 오버레이 뒤 요소로 이동
- Escape 키로 닫기 불가
- role="dialog" 및 aria-modal 없음

### Fix
- focus trap: Tab/Shift+Tab을 오버레이 내부로 제한
- Escape 키 핸들링
- `role="dialog" aria-modal="true"` 추가
- 닫힐 때 이전 포커스 요소로 복귀

### Prevention
- 모달/오버레이 컴포넌트에는 항상 포커스 트랩 + Escape + role=dialog 적용

---

## 2026-04-20 — AI 초안이 HWPX 다운로드 파일에 반영되지 않음

### What happened
- 사용자: "AI 초안 내용이 미리보기에 보이는데 다운로드 파일은 전혀 다른 내용"
- 실제로는 AI content는 HWPX 에 들어있었지만, `normalize_toc` 가 `추가 섹션 4/5` 로 pad + AI 문장 수가 body 슬롯보다 적으면 마지막 문장 중복 복사 → 사용자 눈에는 "다른 내용" 으로 보임

### Why
- `scripts/build_hwpx.py` `normalize_toc` 가 하드코딩된 5개 슬롯을 강제 (과거 gonmun 기본 템플릿에만 맞춰짐)
- `apply_smart_replacements` 가 AI 문장 부족하면 `sentences[-1]` 중복으로 padding

### Fix
- `normalize_toc` → pad 제거. AI 가 준 개수 그대로 사용
- body 슬롯 > AI 문장이면 남은 슬롯을 빈 문자열로 비움 (중복 X)
- E2E 테스트로 `MARKER_A..F` 각각 정확히 1회 등장 확인

### Prevention
- `CLAUDE.md` **R6** 추가 — AI N섹션 ↔ 템플릿 body 슬롯 불일치 처리 규칙
- `tools/verify-hwpx-markers.py` — 마커 카운트 검증
- `tools/smoke-test.sh` — 매 변경마다 E2E 돌려 중복/누락 감지

---

## 2026-04-20 — `cairosvg` 로드 실패로 HWPX 빌드 전체 실패

### What happened
- 사용자가 다이어그램 포함 요청 시:
  ```
  OSError: no library called "cairo-2" was found
  ```
- 예외가 잡히지 않아 Python 프로세스 exit code 1, 서버가 "HWPX 생성 실패" 반환

### Why
- `embed_diagrams` 가 `except ImportError` 만 catch
- macOS 에 네이티브 `libcairo` 미설치 상태에서 `import cairosvg` 가 `OSError` 발생
- `ImportError` 는 못 잡음

### Fix
- `except (ImportError, OSError)` 로 변경
- 경고 메시지에 **OS별 설치 명령** (`brew install cairo`, `apt-get install libcairo2`) 안내
- 다이어그램만 스킵, 나머지 HWPX 는 정상 생성

### Prevention
- `CLAUDE.md` **R4** — Python/Node 경계에서 optional 네이티브 의존성은 graceful degrade
- 패턴: `except (ImportError, OSError, ModuleNotFoundError) as exc: ...` 로 넓게 catch

---

## 2026-04-20 — `@rhwp/core@0.7.3` 업그레이드 후 WASM init 실패

### What happened
- 사용자: "문서 분석에 실패했습니다: WebAssembly.instantiate(): Import #1 ./rhwp_bg.js __wbg_measureTextWidth_0962d94b80b2a16a: function import requires a callable"
- 파일 업로드 미리보기, 빌드 미리보기, 다운로드 버튼 모두 망가짐

### Why
- `package.json` `"^0.7.2"` → npm이 0.7.3 자동 설치
- 0.7.3 의 wasm-bindgen glue 또는 Vite dev 환경과의 호환성 이슈
- Vite dev 서버가 stale 0.7.3 모듈 그래프를 메모리에 유지

### Fix
- `"@rhwp/core": "0.7.2"` (exact pin, `^` 제거)
- `node_modules/.vite` cache 삭제
- dev 서버 완전 재시작 + 브라우저 하드 리프레시

### Prevention
- `CLAUDE.md` **R2** — 네이티브 바인딩 있는 deps 는 exact pin
- `CLAUDE.md` **R3** — `package.json` 변경 후 재시작 워크플로우
- `hooks/post-deps-change.sh` — cache clear + 재시작 안내 자동 출력
- `docs/adr/0001-rhwp-version-pinning.md` — 영구 기록

---

## 2026-04-20 — `.env` 저장 시 사용자 수정 항목 유실

### What happened
- `/api/settings` 호출마다 `.env` 전체 rewrite → 사용자가 손으로 추가한 항목들 사라짐

### Why
- `writeEnvFile(overrides)` 가 declared 키 목록만 출력하고, 기존 .env 내용 무시

### Fix
- 기존 `.env` 파싱 → overrides merge → 재작성
- declared 외 키는 `# User-defined` 섹션에 보존

### Prevention
- env 저장 함수는 **항상 read-merge-write** 패턴
- 테스트: `.env` 에 `CUSTOM_KEY=foo` 수동 추가 → /api/settings 호출 → `CUSTOM_KEY` 유지 확인

---

## 2026-04-20 — OAuth state Map 메모리 누수

### What happened
- `oauthStates` Map 에 TTL cleanup 없어 재시작 때까지 쌓임

### Why
- state 검증은 했지만 만료 항목 `oauthStates.delete()` 안 함

### Fix
- `setInterval(sweep, 60_000).unref()` 로 10분 TTL 넘은 항목 정리

### Prevention
- 모든 in-memory Map/Set 은 **TTL + sweep interval** 쌍으로 관리
- 또는 사용 직후 (consume-and-delete) 패턴

---

## 2026-04-20 — 한글 파일명 mojibake

### What happened
- `generated/` 에 `1776581...-áá¢áá£...hwpx` 깨진 이름 파일 다수

### Why
- multer 가 원본 파일명을 latin1 로 해석. 한글 UTF-8 bytes 가 latin1 로 잘못 디코딩됨

### Fix
- `decodeOriginalName(rawName)` — mojibake 패턴 감지 후 `Buffer.from(rawName, 'latin1').toString('utf8')` + NFC 정규화

### Prevention
- multer 파일 진입 직후 `decodeOriginalName` 필수 호출
- `assertValidUpload` 로 extension + MIME + magic 삼중 검증

---

## 2026-04-20 — HWPX 단락 내 글자 겹침

### What happened
- 다운로드한 HWPX 에서 제목 옆에 "폰트 HY헤드라인M, 크기 18" 같은 템플릿 보일러플레이트가 겹쳐 보임
- 각 섹션 첫 줄이 bold + 좁은 자간으로 이상하게 표시

### Why
- `t_nodes[0].text = new_text` 만 하고 나머지 `<hp:t>` 와 `<hp:run>` 의 stale 텍스트/스타일이 남음
- `<hp:linesegarray>` 가 원본 텍스트 길이 기준으로 계산되어 새 텍스트 위치가 깨짐

### Fix
- `_normalize_paragraph(p, text)` — first run 만 유지, 나머지 text-only run 제거, linesegarray 리셋
- 래퍼 단락 (테이블 포함) 은 skip (직접 텍스트 없음)

### Prevention
- `CLAUDE.md` **R5** — HWPX 템플릿 편집 시 항상 `_normalize_paragraph` 경유
- 직접 `.text = ` 금지 → lint rule 고려

---

## 2026-04-20 — "완료" 선언 후 사용자 실제 동작 실패 반복

### What happened
- 코드 변경 → 빌드 성공 → "완료" 선언 → 사용자 브라우저에서 실제로 돌려보니 실패 (여러 번 반복)

### Why
- `node --check` / `vite build` 는 syntax/bundling 검증일 뿐 런타임 동작 보장 안 함
- 브라우저 UI 는 내가 확인 불가
- 변경 영향 범위를 끝까지 추적하지 않음

### Fix (세션 중 적용)
- 사용자가 반복 지적 후 E2E 테스트 (실제 API 호출 → 다운로드 → 마커 검증) 습관화

### Prevention
- `CLAUDE.md` **R1** — "완료" 선언 금지. **evidence (E2E log) 먼저, 판단은 사용자가**
- `hooks/pre-completion-checklist.sh` — 완료 전 자동 smoke-test 강제
- `tools/smoke-test.sh` — 한 번에 돌릴 수 있는 스크립트

---

## 메모

새 실수 발생 시 이 파일 맨 위에 날짜 역순으로 추가할 것.
관련 규칙이 있으면 `CLAUDE.md` R# 링크로 연결.
