# 요구사항 추적 매트릭스 (RTM - Requirements Traceability Matrix)

> 본 문서는 HWP/HWPX AI 문서 생성 데모 서비스(v2)의 요구사항이 설계, 구현, 테스트 단계까지 추적될 수 있도록 연결한다.

| 항목 | 내용 |
|------|------|
| **프로젝트명** | HWP/HWPX AI 문서 생성 데모 서비스 (v4) |
| **문서 버전** | v1.3 |
| **작성일** | 2026-04-20 |

---

## 추적 매트릭스

| 요구사항 ID | 요구사항 명세 | 유스케이스 | 설계 문서 | 소스코드 | 테스트케이스 | 상태 |
|-------------|---------------|------------|-----------|----------|--------------|------|
| FR-UPLOAD-001 | `.hwp`/`.hwpx` 파일 업로드 | UC-01 | 화면설계서 | `Uploader.jsx`, `App.jsx` | TC-UPLOAD-001 | ✅ 구현 |
| FR-UPLOAD-002 | 파일 크기 제한 | UC-01 | API설계서 | `upload.js`, `index.js` | TC-UPLOAD-002 | ✅ 구현 |
| FR-UPLOAD-003 | 브라우저 WASM 초기화 및 파싱 | UC-01 | 상세설계서 | `useRhwp.js` | TC-UPLOAD-003 | ✅ 구현 |
| FR-UPLOAD-004 | SVG 페이지 미리보기 렌더링 | UC-01, UC-05 | 화면설계서 | `PreviewPanel.jsx`, `useRhwp.js` | TC-UI-001 | ✅ 구현 |
| FR-UPLOAD-005 | 추출 텍스트를 AI 입력으로 사용 | UC-01, UC-02 | 상세설계서 | `useDraft.js`, `draft.js` | TC-DRAFT-001 | ✅ 구현 |
| FR-UPLOAD-006 | `.hwpx` 업로드 시 템플릿 재사용 | UC-01, UC-03 | 상세설계서 | `hwpxBuilder.js`, `build_hwpx.py` | TC-EXPORT-001 | ✅ 구현 |
| FR-UPLOAD-007 | `.hwp` 업로드 시 기본 템플릿 사용 | UC-01, UC-03 | 상세설계서 | `hwpxBuilder.js`, `build_hwpx.py` | TC-EXPORT-002 | ✅ 구현 |
| FR-UPLOAD-008 | 드래그 앤 드롭 업로드 | UC-01 | 화면설계서 | `Uploader.jsx` | TC-UPLOAD-004 | ✅ 구현 |
| FR-UPLOAD-009 | 파일 해제 | UC-06 | 화면설계서 | `Uploader.jsx`, `App.jsx` | TC-UPLOAD-005 | ✅ 구현 |
| FR-UPLOAD-010 | 다중 페이지 텍스트 추출 | UC-01 | 상세설계서 | `useRhwp.js` (`enrichAdditionalPages`) | TC-UPLOAD-006 | ✅ 구현 |
| FR-DRAFT-001 | 문서 유형 선택 | UC-02 | 화면설계서 | `ControlPanel.jsx`, `helpers.js` | TC-DRAFT-002 | ✅ 구현 |
| FR-DRAFT-002 | 회사명/목표/메모 입력 | UC-02 | 화면설계서 | `ControlPanel.jsx` | TC-DRAFT-003 | ✅ 구현 |
| FR-DRAFT-003 | 제목 입력 또는 파일명 자동 추출 | UC-02 | 화면설계서 | `App.jsx` | TC-DRAFT-004 | ✅ 구현 |
| FR-DRAFT-004 | 선택된 Provider로 AI 초안 생성 | UC-02 | 시스템아키텍처설계서 | `services/ai.js`, `draft.js` | TC-DRAFT-005 | ✅ 구현 |
| FR-DRAFT-005 | JSON 구조 응답 (summary/sections/diagrams) | UC-02 | API설계서 | `shared/validate.js`, `draft.js` | TC-DRAFT-006 | ✅ 구현 |
| FR-DRAFT-006 | 파싱 실패 시 최대 1회 재시도 | UC-02 | 상세설계서 | `draft.js` | TC-DRAFT-007 | ✅ 구현 |
| FR-DRAFT-007 | 템플릿 재사용 모드 시 섹션 구조 유지 | UC-02 | 상세설계서 | `draft.js` (prompt) | TC-DRAFT-008 | ✅ 구현 |
| FR-DRAFT-008 | 소스 분석 모드 시 기본 목차 기반 작성 | UC-02 | 상세설계서 | `shared/docTypes.js`, `draft.js` | TC-DRAFT-009 | ✅ 구현 |
| FR-DRAFT-009 | Optimistic UI 제공 | UC-02 | 화면설계서 | `useDraft.js` | TC-UI-002 | ✅ 구현 |
| FR-DRAFT-010 | 다이어그램 자동 생성 | UC-02 | 상세설계서 | `draft.js`, `build_hwpx.py` | TC-EXPORT-003 | ✅ 구현 |
| FR-EXPORT-001 | AI 초안 기반 HWPX 생성 | UC-03 | 시스템아키텍처설계서 | `hwpxBuilder.js`, `build_hwpx.py` | TC-EXPORT-004 | ✅ 구현 |
| FR-EXPORT-002 | 원본 양식 서식 유지 | UC-03 | 상세설계서 | `build_hwpx.py` (`apply_smart_replacements`) | TC-EXPORT-005 | ✅ 구현 |
| FR-EXPORT-003 | 제목/목차/본문/메타데이터 일치 | UC-03 | 상세설계서 | `build_hwpx.py` | TC-EXPORT-006 | ✅ 구현 |
| FR-EXPORT-004 | 다이어그램 PNG 임베딩 | UC-03 | 상세설계서 | `build_hwpx.py` (`embed_diagrams`) | TC-EXPORT-007 | ✅ 구현 |
| FR-EXPORT-005 | `/generated/` 경로 다운로드 | UC-03 | API설계서 | `server/index.js`, `hwpxBuilder.js` | TC-EXPORT-008 | ✅ 구현 |
| FR-EXPORT-007 | 다운로드 링크 직접 표시 | UC-03 | 화면설계서 | `ControlPanel.jsx` | TC-UI-008 | ✅ 구현 |
| FR-PROVIDER-001 | 4개 Provider 지원 | UC-04 | 시스템아키텍처설계서 | `providers-config.js`, `ai.js` | TC-PROVIDER-001 | ✅ 구현 |
| FR-PROVIDER-002 | API 키 UI 입력 또는 `.env` 설정 | UC-04 | 화면설계서 | `ProviderSettings.jsx`, `providers.js` | TC-PROVIDER-002 | ✅ 구현 |
| FR-PROVIDER-003 | 1문장 테스트 프롬프트 연결 확인 | UC-04 | API설계서 | `routes/providers.js` | TC-PROVIDER-003 | ✅ 구현 |
| FR-PROVIDER-004 | OAuth 2.0 인증 지원 | UC-04 | 상세설계서 | `routes/auth.js`, `oauth.js` | TC-PROVIDER-004 | ✅ 구현 |
| FR-UI-001 | 원본 문서 SVG 미리보기 | UC-05 | 화면설계서 | `PreviewPanel.jsx` | TC-UI-004 | ✅ 구현 |
| FR-UI-002 | AI 초안 섹션/본문 렌더링 | UC-02 | 화면설계서 | `PreviewPanel.jsx` | TC-UI-005 | ✅ 구현 |
| FR-UI-003 | 다이어그램 SVG 렌더링 | UC-02 | 화면설계서 | `PreviewPanel.jsx`, `diagrams.js` | TC-UI-006 | ✅ 구현 |
| FR-UI-004 | 최종 HWPX SVG 미리보기 | UC-05 | 화면설계서 | `PreviewPanel.jsx`, `useRhwp.js` | TC-UI-007 | ✅ 구현 |
| FR-UI-005 | HWPX 다운로드 버튼 | UC-03 | 화면설계서 | `ControlPanel.jsx` | TC-UI-008 | ✅ 구현 |
| FR-UI-006 | 단계별 섹션 레이블 | UC-01~03 | 화면설계서 | `ControlPanel.jsx` | TC-UI-009 | ✅ 구현 |
| FR-UI-007 | 메타 정보 표시 | UC-01, UC-05 | 화면설계서 | `PreviewPanel.jsx`, `Uploader.jsx` | TC-UI-010 | ✅ 구현 |
| FR-UI-008 | 초안 재생성 버튼 | UC-02 | 화면설계서 | `ControlPanel.jsx` | TC-UI-011 | ✅ 구현 |
| FR-A11Y-001 | 업로드 영역 ARIA 속성 | UC-01 | 화면설계서 | `Uploader.jsx` | TC-A11Y-001 | ✅ 구현 |
| FR-A11Y-002 | 키보드 Enter/Space 지원 | UC-01 | 화면설계서 | `Uploader.jsx` | TC-A11Y-002 | ✅ 구현 |
| FR-A11Y-003 | 파일 거부 alert | UC-01 | 화면설계서 | `Uploader.jsx` | TC-A11Y-003 | ✅ 구현 |
| NFR-PERF-001 | WASM 파싱 ≤ 3초 | - | 시스템아키텍처설계서 | `useRhwp.js` | TC-PERF-001 | ✅ 검증 |
| NFR-PERF-002 | AI 생성 ≤ 15초 | - | 시스템아키텍처설계서 | `services/ai.js` | TC-PERF-002 | ✅ 검증 |
| NFR-PERF-003 | HWPX 생성 ≤ 5초 | - | 시스템아키텍처설계서 | `build_hwpx.py` | TC-PERF-003 | ✅ 검증 |
| NFR-PERF-006 | 다중 페이지 추출 ≤ 2초 | - | 상세설계서 | `useRhwp.js` | TC-PERF-004 | ✅ 검증 |
| NFR-SEC-001 | 서버 `127.0.0.1` 바인딩 | - | 시스템아키텍처설계서 | `server/index.js` | TC-SEC-001 | ✅ 구현 |
| NFR-SEC-002 | API 키 클라이언트 미노출 | - | 상세설계서 | `providers.js`, `ai.js` | TC-SEC-002 | ✅ 구현 |
| NFR-SEC-003 | 업로드 파일 즉시 삭제 | - | 상세설계서 | `hwpxBuilder.js` | TC-SEC-003 | ✅ 구현 |
| NFR-SEC-005 | Magic bytes 검증 | - | 상세설계서 | `upload.js` | TC-SEC-004 | ✅ 구현 |
| NFR-REL-001 | AI 응답 실패 시 1회 재시도 | UC-02 | 상세설계서 | `draft.js` | TC-DRAFT-007 | ✅ 구현 |
| NFR-REL-002 | `cairosvg` 미설치 시에도 HWPX 생성 | UC-03 | 상세설계서 | `build_hwpx.py` | TC-EXPORT-009 | ✅ 구현 |
| NFR-REL-004 | WASM 실패 시 앱 유지 | UC-01 | 상세설계서 | `useRhwp.js` | TC-UPLOAD-007 | ✅ 구현 |
| NFR-UX-001 | `npm install && npm run dev` 실행 | - | 배포계획서 | `package.json` | TC-UX-001 | ✅ 구현 |
| NFR-UX-002 | 키 미설정 시 안내 메시지 | UC-04 | 화면설계서 | `ProviderSettings.jsx` | TC-PROVIDER-005 | ✅ 구현 |
| NFR-UX-003 | 단계별 진행 상태 표시 | UC-01~03 | 화면설계서 | `ControlPanel.jsx` | TC-UI-009 | ✅ 구현 |
| NFR-UX-004 | 드래그 앤 드롭 시각적 피드백 | UC-01 | 화면설계서 | `Uploader.jsx` | TC-UPLOAD-004 | ✅ 구현 |
| NFR-A11Y-001 | 키보드 전체 흐름 완료 | UC-01~03 | 화면설계서 | 전체 | TC-A11Y-004 | ✅ 구현 |
| NFR-A11Y-002 | 색상 이외 정보 구분 | UC-01~03 | 화면설계서 | 전체 | TC-A11Y-005 | ✅ 구현 |
| NFR-A11Y-003 | 초점 표시 | UC-01~03 | 화면설계서 | `styles.css` | TC-A11Y-006 | ✅ 구현 |
| **FR-AUTH-001** | Google OAuth 로그인/로그아웃 | UC-07 (신설) | API설계서 | `useAuth.js`, `routes/googleAuth.js`, `LoginOverlay.jsx`, `TopBar.jsx` | TC-AUTH-001 | ✅ 구현 |
| **FR-AUTH-002** | 세션 쿠키 지속 + `/auth/session` 폴링 | UC-07 | API설계서 | `useAuth.js`, `cookieParser`, `index.js` | TC-AUTH-002 | ✅ 구현 |
| **FR-AUTH-003** | `VITE_AUTO_LOGIN=true` 시 전체화면 LoginOverlay | UC-07 | 화면설계서 | `App.jsx`, `LoginOverlay.jsx` | TC-AUTH-003 | ✅ 구현 |
| **FR-PRV-001** | 미리보기 HWPX ↔ 다운로드 바이트 동일성 | UC-03, UC-05 | ADR-0002 | `App.jsx` handleGenerate 체인, `useRhwp.renderBuiltHwpx`, `useDraft.buildHwpx` | TC-PRV-001 | ✅ 구현 |
| **FR-AI-MAP-001** | AI N섹션 ↔ HWPX N섹션 1:1 매핑 (pad/중복/placeholder 금지) | UC-02, UC-03 | ADR-0003 | `build_hwpx.py` `normalize_toc`, `apply_smart_replacements` | TC-EXPORT-010 | ✅ 구현 |
| **FR-PROVIDER-005** | AI Provider localStorage 영속화 + 리로드 시 configured 자동 전환 | UC-04 | 상세설계서 | `hooks/useProviders.js` | TC-PROVIDER-006 | ✅ 구현 |
| **NFR-SEC-006** | `.env` 저장 read-merge-write (사용자 추가 키 보존) | - | 상세설계서 | `server/lib/env.js` | TC-SEC-005 | ✅ 구현 |
| **NFR-SEC-007** | OAuth state Map TTL 10분 + 60s sweep | - | 상세설계서 | `server/lib/oauth.js` | TC-SEC-006 | ✅ 구현 |
| **NFR-SEC-008** | SVG 텍스트 XML escape 필수 | - | 상세설계서 | `shared/escape.js`, `client/src/lib/diagrams.js` | TC-SEC-007 | ✅ 구현 |
| **NFR-SEC-009** | 업로드 파일명 UTF-8 복원 (한글 mojibake 방지) | - | 상세설계서 | `server/lib/upload.js` `decodeOriginalName` | TC-SEC-008 | ✅ 구현 |
| **NFR-SEC-010** | AI 응답 스키마 검증 + 1회 재시도 | UC-02 | 상세설계서 | `shared/validate.js`, `services/draft.js` | TC-DRAFT-010 | ✅ 구현 |
| **NFR-REL-005** | HWPX 단락 정규화(`_normalize_paragraph`) 로 글자 겹침 방지 | UC-03 | 상세설계서 | `scripts/build_hwpx.py` | TC-EXPORT-011 | ✅ 구현 |
| **NFR-REL-006** | `@rhwp/core@0.7.2` exact pin (업그레이드는 ADR-0001 체크리스트) | - | ADR-0001 | `client/package.json` | TC-DEPS-001 | ✅ 구현 |
| **NFR-OPS-001** | 완료 선언 전 `pre-completion-checklist.sh` 통과 | - | CLAUDE.md R1 | `v2/hooks/pre-completion-checklist.sh` | TC-OPS-001 | ✅ 구현 |
| **NFR-OPS-002** | 의존성 변경 후 cache clear + 재시작 | - | CLAUDE.md R3 | `v2/hooks/post-deps-change.sh`, `skills/dev-server-restart.md` | TC-OPS-002 | ✅ 구현 |
| **NFR-OPS-003** | HWPX 바이트 내 마커 존재 검증 도구 | - | 테스트계획서 | `v2/tools/verify-hwpx-markers.py`, `smoke-test.sh` | TC-OPS-003 | ✅ 구현 |

---

## 상태 정의

| 상태 | 의미 |
|------|------|
| ✅ 구현 | 코드로 구현 완료, 로컬 테스트 통과 |
| 🔄 진행중 | 개발 또는 테스트 진행 중 |
| ⏳ 대기 | 선행 작업 대기 중 |
| ❌ 제외 | 스코프에서 제외됨 |
