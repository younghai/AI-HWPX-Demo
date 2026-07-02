# ADR 0002: 미리보기 ↔ 다운로드 바이트 동일성

**Status**: Accepted — 2026-04-20

## Decision

미리보기에 표시되는 HWPX 와 사용자가 다운로드하는 HWPX 는 **동일한 서버 측 파일**이어야 한다.

## 흐름

```
AI 초안 생성 (/api/generate-draft)
   ↓ draft JSON
서버가 즉시 HWPX 빌드 (/api/export-hwpx, Python worker)
   ↓ 서버 디스크에 /generated/<filename>.hwpx 저장
클라이언트가 URL fetch → rhwp 로 SVG 렌더 → 미리보기 표시
   ↓
사용자 "다운로드" 클릭 → 같은 URL 의 바이트 다운로드
```

## Rationale

이전 설계:
- 미리보기: `draft.sections` 을 HTML (`<h2>/<p>`) 로 렌더
- 다운로드: 서버가 Python 빌드 → 사용자가 한컴에서 열기
- → **두 파이프라인이 다른 엔진 / 다른 스타일** → "preview != download" 사용자 불만 반복

새 설계:
- 초안 생성 시점에 바로 HWPX 를 빌드하고, rhwp 로 **그 파일을 SVG 렌더**해서 미리보기
- 다운로드는 **렌더링에 사용된 바로 그 URL**
- → 1 source of truth

## Consequences

- AI 초안 단계에서 서버 Python 빌드 대기 시간 (~수 초) 추가
- AI 결과가 한 번에 좋지 않으면 재빌드 부담 (현재는 "초안 재생성" 단일 버튼)
- rhwp 렌더가 실패하면 HTML fallback 으로 degrade. 다운로드는 여전히 가능 (`exportState.url` 기준)

## 관련 코드

- `v2/client/src/hooks/useDraft.js` `buildHwpx()` — URL 반환, auto-download 안 함
- `v2/client/src/hooks/useRhwp.js` `renderBuiltHwpx(url, fileName)` — 빌드된 HWPX 를 SVG 로
- `v2/client/src/App.jsx` `handleGenerate()` — generate → build → render 체인

## 회귀 방지

- `tools/smoke-test.sh` 단계 6: 실제 /api/export-hwpx → 다운로드 → 마커 검증
- 마커가 없으면 fail
