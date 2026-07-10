# SPEC-P6-CSP — Content-Security-Policy 활성화

> **작성·구현:** Claude (Fable 5) 직접(승인된 모드) · **작성일:** 2026-07-10
> 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) Phase 6. 근거: [appendix/A](appendix/A-server.md) §9 "CSP disabled".

---

## 배경

`server/index.js`가 `helmet({ contentSecurityPolicy: false })` — 주석에 명시된 이유는 "OAuth 결과 페이지가 인라인 스크립트에 의존". 페이지 몇 개 때문에 **앱 전체**의 CSP가 꺼져 있었다.

## 설계 — 이중 정책

1. **SPA/API (기본, 엄격)** — helmet 기본(useDefaults) 위에:
   - `script-src 'self' 'wasm-unsafe-eval'` — `@rhwp/core`의 `WebAssembly.instantiate` 필요.
   - `img-src 'self' data: blob:` — 다이어그램 캔버스 래스터화(blob)·SVG data URI.
   - `connect-src 'self'` — fetch/SSE.
   - `upgrade-insecure-requests` 해제 — 로컬은 http 직결(배포는 nginx TLS 종단, nginx 계층 CSP는 별도 파일에 이미 존재).
   - 나머지는 helmet 기본: `object-src 'none'`, `script-src-attr 'none'`(React는 HTML 속성 핸들러를 안 씀), `style-src 'unsafe-inline'`(React inline style), `frame-ancestors 'self'` 등.
2. **`/auth/*` (완화 오버라이드)** — OAuth 결과·모의 로그인 페이지는 서버 생성 HTML로 인라인 `<script>`(postMessage)·`onclick`·`<style>` 사용: `default-src 'none'; script-src 'unsafe-inline'; script-src-attr 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'`. 메시지 삽입은 `escapeXml` 경유 확인(주입 벡터 없음) — 완화가 안전. helmet이 먼저 설정한 헤더를 라우트 미들웨어의 `res.set`이 덮어쓴다.

nonce 방식(페이지 3곳에 nonce 파이프라인)은 침습 대비 이득이 적어 기각 — 해당 페이지는 정적 신뢰 콘텐츠 + escape 적용.

## 검증 (실앱 구동 — 2026-07-10)

client 프로덕션 빌드 + `node server/index.js`(SPA 서빙) + 브라우저(Preview):
1. **CSP 헤더 실측** — SPA 응답에 의도한 정책 그대로(위 directives), `/auth/google` 응답에 완화 정책 그대로.
2. **전체 플로우 E2E, 콘솔 위반 0** — 첫 화면 렌더 → 샘플(report-basic.hwpx) 클릭 → **rhwp WASM 파싱 성공**(페이지 수 표시 — `wasm-unsafe-eval` 유효) → 데모 초안 5섹션 SSE 생성 → **HWPX 빌드 성공**(`/generated/….hwpx` 다운로드 링크). 전 과정 콘솔 warn/error 0(CSP "Refused…" 없음).

## 위험

- 낮음. 유일한 관찰 변화는 헤더 추가. 미래에 외부 리소스(웹폰트 CDN, 아바타 이미지 등)를 도입하면 해당 호스트를 directives에 추가해야 함(현재 index.html은 외부 리소스 0).
- dev(vite :5192)는 vite가 서빙하므로 이 CSP의 영향 없음(프로덕션/single-process 모드 전용).
