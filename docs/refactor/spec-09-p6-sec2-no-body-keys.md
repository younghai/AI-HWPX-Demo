# SPEC-P6-SEC2 — 생성 경로의 요청-body API 키 차단

> **작성·구현:** Claude (Fable 5) 직접(승인된 모드) · **작성일:** 2026-07-10
> 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) §3 SEC-2 [LOW] · Phase 6. 근거: [appendix/A](appendix/A-server.md) §8.

---

## 결함 · 실태

감사 지적: 시크릿(API 키)이 **신뢰할 수 없는 요청 payload를 통해** 외부 provider 호출로 흘러든다.

실태 조사 결과 두 경로의 성격이 다르다:

| 경로 | 실태 | 판단 |
|---|---|---|
| 생성: `input.aiApiKey` (`draft.js` buildDraftWithAI `clientKey`·buildDraftParallel + per-section 전달) | **client가 생성 요청에 키를 싣지 않음**(useDraft 생성 body에 키 필드 없음 — ProviderSettings의 키 상태는 test/settings 전용) → 정당한 사용자 0인 **죽은 주입 채널**. 임의 호출자가 env/OAuth 설계를 우회해 시크릿을 주입 가능 | **제거** (UX 영향 0) |
| 키 검증: `POST /api/test-provider`의 `req.body.apiKey` / 저장: `POST /api/settings` | 의도된 설정 UX(붙여넣기→테스트→.env 저장). requireSession + pino redact(`*.apiKey`) 적용 | **유지** + redact 보강 |

## 변경 설계

1. **`services/draft.js`** — 생성 경로의 body-키 3사이트 제거:
   - `buildDraftWithAI`: `clientKey` 선언(:39)과 `|| clientKey` 폴백(:49) 삭제 → 키는 `resolveApiKey`(env ‖ 사용자별 OAuth)만.
   - `buildDraftParallel`: `|| String(input.aiApiKey||'')`(:225) 삭제.
   - parallel worker의 `aiApiKey: input.aiApiKey` 전달(:249) 삭제 — 수신측(`regenerateSectionWithAI`)은 애초에 읽지 않는 죽은 전달.
2. **[SEC-1 잔여 갭 동시 교정]** parallel worker의 `regenerateSectionWithAI({...})` 호출에 `{ userKey }` 전달 — 누락 시 protected 모드에서 per-section 키 해석이 `'local'` 버킷으로 떨어져 사용자 OAuth 토큰을 못 쓴다.
3. **`lib/logger.js`** — redact에 `'req.body.apiKey'` 명시 추가(pino `*`는 1레벨만 매칭하므로 `*.apiKey`가 `req.body.apiKey`를 못 덮음; 현재 body를 로깅하는 곳은 없으나 방어적).
4. 401 안내문("환경변수 … 설정하거나 UI에서 입력")은 그대로 정확 — "UI 입력"은 설정 모달(.env 저장) 경로.

## 수용 기준

1. **주입 차단(RED-provable):** env 키·OAuth 토큰이 없는 상태에서 `aiApiKey: 'sk-injected'`를 body에 실어도 생성(일반·parallel 모두)이 **네트워크 호출 전에 401** — 구코드는 주입 키로 provider 호출을 시도했다.
2. 정상 경로(env 키 또는 OAuth) 무변화. `/api/test-provider`·`/api/settings` UX 무변화.
3. server 스위트 GREEN.

## 위험

- **매우 낮음.** 제거 대상은 사용자 0의 죽은 채널. 유일한 외부 관찰 변화 = 키 주입 시도가 401로 명시 거부.
- SEC-2로 남는 것: test-provider/settings의 body 키는 **의도된 제품**(localhost 설정 도구) — TLS(배포 nginx)·requireSession·redact로 방어. 이를 없애려면 설정 UX 자체를 바꿔야 하므로 제품 결정 영역.
