# SPEC-P3 — server 구조 정리 (paths · spawn 통합 · TTL/결과페이지 추출)

> **작성·구현:** Claude (Fable 5) 직접(승인된 모드) · **작성일:** 2026-07-10
> 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) Phase 3. 근거: [appendix/A](appendix/A-server.md) §3·§5·§6·§8·§10.
> 항목별 독립 커밋. server 전용 — 병렬 client 트랙과 무충돌.

---

## P3-a — `lib/paths.js` 경로 단일 출처 [A-rec 2]

**결함:** repo 루트를 5곳에서 3가지 이름(`v4Root`/`v3Root`/`repoRoot`)으로 재계산(복붙 드리프트의 화석). `generatedDirectory`가 **서비스**(hwpxBuilder)에서 export되어 부트스트랩·라우트가 서비스를 경로 상수 때문에 import(레이어 역전, A§8). python 실행이 hwpxBuilder는 venv-인식 `pythonCmd`, validator는 `'python3'` 하드코딩(같은 저장소의 워커를 다른 인터프리터로 실행하는 드리프트).

**설계:** `server/lib/paths.js`가 `repoRoot`·`scriptsDir`·`generatedDirectory`·`workDirectory`·`pythonCmd`(venv-인식)를 단일 소유. 소비자 7파일(hwpxBuilder·validator·polarisValidator·hwpConvert·samples·history·index)이 import. mkdir 부작용은 디렉토리를 쓰는 hwpxBuilder에 유지. **행동 변화 1건(의도):** validator가 venv python 사용(validate.py는 stdlib-only라 어느 쪽이든 동작 — 인터프리터 통일이 목적).

## P3-b — spawn 단일화: `runProcess`에 출력 캡·정확-env 추가, `runConverter` 삭제 [A-rec 6]

**결함:** `hwpConvert.runConverter`(43줄)가 `utils.runProcess`의 timeout→SIGTERM→SIGKILL 상태기계를 **재구현**(+출력 캡). 이중 구현 드리프트 + converter는 spawn 슬롯 예산(`MAX_WORKER_SPAWNS`) 밖에서 실행.

**설계:** `runProcess` 옵션 확장 — `maxOutputBytes`(초과 시 SIGTERM + `ok:false`), `exactEnv`(process.env 병합 없이 **그대로** 전달 — converter의 env 화이트리스트 보존), 결과에 `reason` 필드 추가(기존 소비자는 무시, converter 로깅이 사용). `runConverter`/`appendOutput` 삭제, converter 호출을 `runProcess(JAVA_BIN, args, repoRoot, {timeoutMs, maxOutputBytes, exactEnv})`로. **부수 개선:** converter가 spawn 슬롯 예산에 포함됨. 의미 강화: timeout/출력초과 시 자식이 0으로 종료해도 `ok:false`(runConverter와 동일 의미론).

## P3-c — `createTtlStore` + 팝업 결과 페이지 공용화 [A-rec 3]

**결함:** in-memory Map + `setInterval` TTL 스윕 패턴이 3벌 복붙(session.js·oauth.js·googleAuth.js), OAuth 결과 페이지 HTML+CSS가 2벌 복붙(`oauthResultPage` vs googleAuth `resultPage` — 제목/문구/postMessage type만 다름).

**설계:** ① `lib/ttlStore.js` `createTtlStore(ttlMs)` — `set/get/take/delete`, get이 만료 검사(스윕은 메모리 회수용). 세 저장소를 전환(공개 API·의미 불변: `consumeState`=take, `getSession` null 계약 유지). ② `lib/popupPage.js` `popupResultPage({title, successHeading, failHeading, success, message, postMessageType, origin})` — 기존 두 페이지와 마크업 동일(escapeXml 경유, /auth 완화 CSP 하 동작). `mockLoginPage`는 구조가 다른 폼 페이지라 **범위 외**(공용 CSS 추출은 ROI 낮음).

## 잔여(후속 턴): A-rec 1(index.js 라우터-only 축소), A-rec 4(라우트 경계 DTO), A-rec 7(buildDraftParallel 거취 — usage shape 정규화 또는 제거 결정).

## 검증 (공통)
- server 스위트 GREEN(+ P3-b: 출력 캡·exactEnv 단위 테스트, P3-c: ttlStore 단위 테스트 신규).
- P3-a는 순수 재배선 — 스위트 + `node --check` + 서버 부팅 스모크.
