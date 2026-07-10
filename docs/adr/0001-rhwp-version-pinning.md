# ADR 0001: `@rhwp/core` 버전 pin

**Status**: Accepted — 2026-04-20 · **Updated 2026-07-10 (현재 pin `0.7.17`)**
**Context**: `client/package.json`

## Decision

`@rhwp/core` 는 **exact pin** (caret `^` 금지). **현재 pin: `0.7.17`** (client/package.json 이 정본).
아래 Rationale의 0.7.2/0.7.3 은 이 결정을 낳은 최초 사고 기록이며, 현재 버전이 아니다.

## Rationale

2026-04-20 업그레이드 시도에서 `^0.7.2` → 0.7.3 자동 설치 → Vite dev 환경에서 WASM instantiate 실패:

```
WebAssembly.instantiate(): Import #1 "./rhwp_bg.js"
  "__wbg_measureTextWidth_0962d94b80b2a16a": function import requires a callable
```

rhwp.js 글루와 WASM 바이너리 바인딩 해시 (0.7.3) 는 일치했지만, 파일시스템 / Vite 서버 레벨에서는 정상이었음에도 브라우저 인스턴스화에서 실패. 원인 심층 조사 결과 Vite의 모듈 캐시와 0.7.3의 wasm-bindgen 글루 간 상호작용 이슈로 추정 (재현 일관성 낮음).

롤백 (0.7.2) 후 즉시 정상 동작 복구.

## Consequences

- **보수적 업그레이드**: 새 릴리즈가 나와도 자동 반영 안 됨. 의도적 업그레이드만 허용
- **업그레이드 절차**: ADR 새 버전 번호 기록 + 이 ADR 업데이트 + `tools/smoke-test.sh` full pass 확인 후 머지
- **trade-off**: 0.7.3+ 의 새 기능 (예: `exportHwpx`, 고급 렌더 품질) 은 포기. 현재는 `pageCount()` + `renderPageSvg()` 만 쓰므로 0.7.2 로 충분

## Upgrade Checklist (향후 시도 시)

1. `npm install @rhwp/core@<new>` 를 임시 브랜치에서
2. `tools/smoke-test.sh` PASS 확인
3. 브라우저 수동 테스트: 파일 업로드 → 미리보기 → AI 생성 → 다운로드 → 한컴에서 열기
4. 성공 시 `package.json` 에 exact pin + 이 ADR 업데이트
5. `docs/lessons-learned.md` 에 경험 기록

## Update Log

- **2026-07-10**: `0.7.2` → `0.7.17` 로 exact pin 승격. 브라우저 실측(샘플→미리보기 3p→AI 생성→빌드→다운로드, 콘솔 에러 0)과 컨테이너 E2E 통과 확인. exact-pin 결정은 유지. (당시 이 ADR 갱신 스텝 4가 누락됐던 것을 리팩토링 감사에서 발견·정정.)
