# Release Notes — Phase ABC (2026-07-03 ~ 2026-07-12)

> 원래 PR 설명 초안으로 작성됐으나, main을 로컬 fast-forward로 동기화하면서
> 사이클 릴리스 노트로 전환. `main`에 이미 반영 완료된 내용의 기록이다.

`phase-abc-2026-07-03` 개발 사이클 전체입니다. 온보딩/데모(A), 생성 UX(B),
문서 품질·표 셀 치환(C), 다이어그램 품질(D), HWP→HWPX 변환(HC-1),
표 보존 원문 컨텍스트(HC-2) 기능과, 이를 지탱하는 `scripts/hwpx/` 패키지·클라이언트
훅·서버 lib 리팩토링(P1~P4), 보안 하드닝(P6: 토큰 스코핑·주입 채널 제거·CSP)이 포함됩니다.
사이클 말미에 GitHub 공개(MIT), CI 가동, 첫 그린 파이프라인까지 완료했습니다.

- **base:** `8959d80` (사이클 시작 시점의 main)
- **기준 커밋:** `a6461b4` (+ 본 노트 커밋)
- **규모:** 81 commits · 135 files · **+7,038 / −1,916**

## 주요 변경

### A. 온보딩 · 데모
- **A1** API 키 없이 전체 흐름을 체험하는 데모 모드(플레이스홀더 초안, 네트워크 없음)
- **A2** 초안 localStorage 자동 저장 + 복구 배너
- **A3** 단일 컨테이너 Docker 패키징 + 프로덕션 SPA 서빙
- **A4** 죽은 `_body_sentence` 제거 + sections-JSON 무음 실패 수정

### B. 생성 UX
- **B1** 다이어그램 클라이언트 렌더링 → export 시 PNG 업로드(미리보기==다운로드)
- **B2** 생성 진행 SSE 스트리밍(대기 중 실시간 상태·재시도 노출)
- **B3** 템플릿 갤러리 — 보고서/제안서/회의록 시작 양식 3종

### C. 문서 품질
- **C1 표 셀(라벨/값) 치환** — 업로드 양식의 `| 일시 | ___ |`, `| 참석자 | ___ |`
  같은 폼 표를 `docFields` 값으로 채움. 라벨은 `docTypes.js`가 단일 진실원
  (`resolveDocFieldValues`), 매칭·채우기·분류 제외는 `scripts/hwpx/fields.py`.
  픽스처 `testdata/minutes-form.hwpx`(결정적 생성기 `scripts/gen_table_fixture.py`) +
  골든 테스트 `scripts/tests/test_table_cell_fill.py`. 회귀 가드
  `test_table_structure_survives_build` 유지.
- **C2** 섹션 병렬 생성 spike(실험적, opt-in) — 실험 결과 품질 열위(요약·다이어그램·
  전역 중복제거 누락)와 실사용 경로 0으로 **사이클 내 제거**(`9f98896`, spec-12 A-rec 7).
  복원 필요 시 git 이력 참조.
- **C3** PDF 동시 출력(미리보기 기준, 클라이언트 렌더링)
- **C4** 품질 KPI — 편집율 + 섹션 재생성율(`/api/metrics`)

### D. 다이어그램
- **D1** 한글 폰트 스택 + 렌더러 파리티 테스트
- **D2** 임베드 실패 가시화(`diagramReport`)
- **D3** cairosvg 폴백 한글 tofu·강조색 텍스트 안 보임 수정

### HC-1. HWP → HWPX 변환
- 변환기 fetch 스크립트 + NOTICE, HWP→HWPX 변환 서비스 + 빌더 배선,
  golden 04 + Docker JRE 스테이지, 매퍼 갭(개요 미사용 폴백 / body 슬롯 없는 heading) 처리
- 업로드 배너가 변환기 가용성 반영 — `providers` 응답의 `capabilities.hwpConvert`
  기반 3-분기 문구(HWPX 양식 유지 / HWP 변환 모드 / 새 양식)

### HC-2. 표 보존 원문 컨텍스트
- `POST /api/extract` — hwpConverter로 HWP/HWPX→Markdown 추출. 표 구조 보존
  (단순=GFM, 병합·중첩=HTML table). 변환기 미가용/실패는 `{ok:false}` graceful(HTTP 200),
  응답 200KB 절단 + `truncated` 플래그, R8 3중 업로드 검증 동일 적용.
- 클라이언트는 파싱 시 capability 게이트로 서버 추출을 채택(`pickSourceText`),
  실패 시 rhwp flat 텍스트 유지 — 회귀 0 원칙. 미리보기 렌더에는 관여하지 않음.
- 원문 문자 예산(12,000자)을 `lib/extractText.js` 단일출처로 통일.

### 리팩토링 (P1~P4)
- **P2** `scripts/hwpx/` 패키지 추출: `namespaces`·`paragraphs`·`fields`·`io`·
  `diagrams`·`sections`, `parent_of` → `ParentIndex` 캡슐화, `build_hwpx.py` 슬림화
- **P1** 클라이언트 `useDocumentFlow` 훅으로 오케스트레이션 분리(App은 조합만),
  `RecoveryBanner`·피드백 문구 정책 추출, draft 프롬프트/usage 분리,
  `shared/schema.js` 단일 계약, config/limits 수렴, `clone_form`·`fix_namespaces` 제거
- **P3** 서버 정리: `lib/paths.js` 경로 단일출처, `runProcess` 확장(`exactEnv`
  화이트리스트·`maxOutputBytes`·구조화 `reason`), 세션 TTL 스토어 추출,
  OAuth 팝업 페이지 분리, `index.js` 라우터 장착 전용(~30줄), draft 입력 정규화 수렴
- **P4** `useDraft` 다이어트(359→217줄): autosave/SSE 스트림/export FormData 조립을
  `lib/draftAutosave·draftStream·exportForm`으로 추출 — 행위 보존, 계약 고정 테스트 13개 동반
- toc를 sections에서 파생 — client→server→python 왕복 제거
- 서버 테스트 4분할(`upload-sections`/`draft`/`security-session`/`infra`) — 주제별 파일

### 보안 (P6)
- **SEC-1** 프로바이더 토큰 per-user 스코핑(세션 격리) — 타 사용자 키 재사용 차단
- **SEC-2** 요청 body 경유 API 키 주입 채널 제거 — 서버 보관 키만 사용
- **CSP 이중 정책** — SPA는 strict(`wasm-unsafe-eval`만 허용, `img-src` data:/blob:,
  `connect-src 'self'`), `/auth` 팝업만 완화 오버라이드. 비용 경로 rate-limit
  목록(`COST_LIMITED_PATHS`)에 JVM 스폰 경로(`/api/extract`) 포함

### 기타 수정 / 인프라
- 템플릿 heading 슬롯 < AI 섹션일 때 섹션 누락 수정, gonmun 정본 폰트 안내 부제 누수 제거
- 모바일(≤375px) TopBar 좌측 클리핑 수정, 데모 모드 안내 명확화
- protected history/metrics 라우트 세션 요구, Node 22 CI 정렬, lint 게이트 복구
- diagram embed + docFields golden 커버리지, minutes 픽스처 정리
- 산출물 무결성(INV) 배치 — 미리보기==다운로드 불변식 관련 정합 수정

## 테스트 (기준 커밋 시점 실측)

- **Python** `pytest scripts/tests/` → **45 passed** (C1 골든 + 표 구조 회귀 가드 + 템플릿 위생 포함)
- **서버** `pnpm -C server test` → **51 passed** (주제별 5파일; C2 spike 테스트 제거 반영)
- **클라이언트** `pnpm -C client test` → **56 passed** (9개 파일) + 프로덕션 빌드 정상, ESLint 0
- **골든 러너** 3/3 (host; 04 HWP 변환 케이스는 JRE 환경 전용 — 컨테이너 E2E로 검증)
- **CI** (GitHub Actions, ubuntu): lint → client/server 테스트 → 빌드 → syntax → pytest 전 단계 그린

## 리뷰 포인트 / 주의

- **미리보기 == 다운로드** 불변식과 R5(단락 정규화)/R6(N섹션↔N슬롯)이 얽힌
  `scripts/hwpx/` 가 핵심. C1은 매칭된 셀만 분류에서 제외하고, 매칭 실패 시 완전 no-op.
- HC-1/HC-2 변환·추출은 JRE 스테이지가 필요(Docker). 로컬 미설치 시 graceful degradation
  (HC-2는 `{ok:false}` → 클라 flat 폴백, 기능 회귀 없음).
- 커밋이 81개로 많음 — 리뷰는 위 그룹(A/B/C/D/HC/P/보안) 단위로 나눠 보는 것을 권장.

## 검증 현황

- 서버 API 레벨: 표 셀 치환 실제 바이트 검증(값이 정확한 셀에 1회 삽입), A/B 바이트 동일성
  빌드(고정 `--doc-date` + zip 엔트리 md5), HC-2 graceful(`ok:false`)·bad-magic 415 실측.
- 브라우저 E2E(preview 도구): 데모 전체 플로우(업로드→생성→빌드→미리보기) 통과, CSP 위반 0,
  콘솔 에러 0, 모드 배너 3-분기 확인.
- 컨테이너 E2E(docker cp+exec): HC-1 변환 경로(마커 주입·이미지 8개 보존·validator 0),
  HC-2 실문서 추출(`capabilities.hwpConvert: true`, HTML table 보존 markdown,
  200KB 절단 플래그) 통과.
- 인프라: GitHub 공개 백업(main=phase-abc, 옛 프로토타입은 `legacy-php-prototype` 보존),
  CI 그린, Docker 빌더 `.npmrc` 제외 후 팬텀 경로 소멸 실측.
- 남은 수동 확인: docFields UI 타이핑 플로우(양식 업로드 → 일시/참석자 직접 입력 → 다운로드)
  1회 — 동일 경로의 API 레벨 검증은 완료된 상태.
