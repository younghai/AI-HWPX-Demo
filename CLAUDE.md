# AI HWP — AI Document Studio (HWP/HWPX Automation)

**Read this file every time before working on this repo. It encodes every mistake we've already made so you don't repeat them.**

> 이 repo는 [younghai/AI_hwp](https://github.com/younghai/AI_hwp) 의 v4 를 독립 실행형으로 추출한 것. 패키지 매니저는 **pnpm** (workspace: `client`, `server`).

---

## 🎯 Mission

업로드한 HWP/HWPX 문서에서 AI가 새로운 초안을 생성하고, **미리보기와 실제 다운로드 파일이 바이트-동일한 HWPX** 로 나와야 한다.

- 미리보기에 보이는 내용 = 다운로드 파일 내용 (절대 원칙)
- AI가 N개 섹션을 생성했으면 HWPX에도 정확히 N개 섹션만 들어간다
- 중복 문장 없음 / pad 텍스트 없음 / 템플릿 placeholder 누수 없음

---

## 🛑 Non-Negotiable Rules (이번 세션에서 실제 깬 것들)

### R1. "완료"라고 말하기 전에 E2E 테스트 증거를 보여라
- syntax OK / 빌드 성공은 "기능 동작"을 의미하지 않는다
- 브라우저 UI 동작은 내가 확인 못 하므로 **서버 API 레벨에서 실제 바이트를 검증**해야 한다
- 다운로드된 HWPX 안에 AI 마커가 실제로 있는지 `tools/verify-hwpx-markers.py` 로 확인
- **실수 이력**: 코드 변경 후 "완료" 선언 → 사용자가 실제로 동작 안 됨 발견 (AI 내용 누락, 글자 겹침, rhwp WASM 에러)

### R2. 의존성 버전은 pin (`^` 금지, 특히 네이티브 바인딩 있는 패키지)
- `@rhwp/core` 는 `0.7.2` 로 exact pin (v0.7.3 WASM import 호환성 이슈 있음)
- cairosvg 같은 네이티브 lib 의존 패키지는 `ImportError` + `OSError` 모두 catch
- **실수 이력**: `^0.7.2` → npm이 0.7.3 자동 설치 → `WebAssembly.instantiate(): function import requires a callable` 에러

### R3. `package.json` 건드렸으면 dev 서버 재시작 + vite cache + 브라우저 하드 리프레시
- `tools/smoke-test.sh` 로 서버 응답 확인 필수
- **실수 이력**: 0.7.3→0.7.2 롤백 후 사용자는 여전히 에러 봄. dev 서버가 메모리에 stale 모듈 그래프를 들고 있었음

### R4. Python/Node 경계의 에러를 Node 계층에서 숨기지 마라
- `runProcess` 의 `stderr` 를 사용자 메시지로 노출 금지. 대신 구조화된 에러 코드
- cairosvg 같은 optional 네이티브 의존성은 graceful degradation (기능 스킵 + 로그 안내)
- **실수 이력**: `cairosvg` 네이티브 libcairo 없어 빌드 전체 실패 (원래 `ImportError` 만 catch, `OSError` 는 놓침)

### R5. HWPX 템플릿 편집 시 단락 내 **추가 `<hp:run>` 제거 + `linesegarray` 리셋**
- 단순히 `t_nodes[0].text = new` 만 하면 나머지 t-node / run 의 stale 텍스트가 시각적으로 겹침
- `_normalize_paragraph()` 사용 강제 — 직접 `.text = ` 금지
- 테이블 래퍼 단락은 skip (실제 텍스트는 셀 내부에 있음)
- **실수 이력**: "폰트 HY헤드라인M, 크기 18" 같은 템플릿 보일러플레이트가 제목 옆에 겹쳐 렌더됨

### R6. AI 섹션 개수 ↔ 템플릿 body 슬롯 개수 불일치
- AI가 N 섹션을 주면 HWPX에도 정확히 N 섹션만 반영 (pad 금지, 중복 금지)
- `normalize_toc` 는 AI가 준 개수를 그대로 유지 (과거 `추가 섹션 4/5` 로 padding 했던 버그)
- body 슬롯이 남으면 빈 상태로 두기. 중복 sentence padding 금지
- **실수 이력**: AI가 1 문장 준 섹션이 HWPX에 **동일 문장 3회 반복**으로 나타남

### R7. SVG 생성 시 사용자/AI 입력 **반드시 `escapeXml`** 경유
- `shared/escape.js` 의 `escapeXml` 을 거치지 않는 백틱 템플릿 삽입은 XSS + SVG 깨짐
- **실수 이력**: 다이어그램 `title`, `step`, `row.label` 등을 이스케이프 없이 삽입

### R8. 파일 업로드는 extension + MIME + magic bytes **셋 다 검증**
- `shared/upload.js` 의 `assertValidUpload` 사용 강제
- 한글 파일명은 `decodeOriginalName` 으로 UTF-8 복원
- **실수 이력**: `generated/1776581...-áá¢áá£...hwpx` 같은 깨진 파일명 다수 발생

---

## 🏗 아키텍처 (ADRs: `docs/adr/`)

```
.
├── shared/              # client + server 공용 유틸 (escape, validate, docTypes)
├── server/
│   ├── lib/             # 순수 유틸 (errors, env, oauth, upload, providers-config, session)
│   ├── services/        # 비즈니스 로직 (ai, draft, hwpxBuilder)
│   ├── routes/          # Express 라우터 (health, providers, draft, export, auth, samples)
│   └── index.js         # 부트스트랩 (라우터 장착만, ~30줄)
├── client/
│   ├── src/
│   │   ├── App.jsx      # 조합만 (~130줄). 로직 금지
│   │   ├── lib/         # 순수 함수 (diagrams, helpers)
│   │   ├── hooks/       # 상태 (useRhwp, useDraft, useProviders, useToast)
│   │   └── components/  # 프레젠테이션 (TopBar, ProviderSettings, ControlPanel,
│   │                       PreviewPanel, EmptyState, Toast, ValidationPanel)
│   └── vite.config.js   # fs.allow=['..'] (workspace 부모 공유 접근)
├── scripts/build_hwpx.py  # Python 워커. Node가 spawn 으로 호출 (repo 내장)
└── templates/              # HWPX 템플릿 + 샘플 문서 (repo 내장)
```

**금기**:
- `server/index.js` 에 라우트/서비스 로직 직접 작성 → 새 라우터 파일 만들기
- `App.jsx` 에 fetch/비즈니스 로직 직접 작성 → hook으로 이동
- 새 공용 상수는 반드시 `shared/` 에 작성 (`buildToc` 중복 같은 drift 방지)

---

## 🔧 빌드 / 테스트 명령

| 목적 | 명령 |
|------|------|
| dev 서버 시작 (server+client 병행) | `pnpm run dev` |
| 클라이언트 프로덕션 빌드 | `pnpm -C client build` |
| 서버 syntax 체크 | `cd server && for f in index.js lib/*.js services/*.js routes/*.js; do node --check "$f"; done` |
| Python 스크립트 syntax | `python3 -m py_compile scripts/build_hwpx.py` |
| **E2E smoke test** | `bash tools/smoke-test.sh` |
| **HWPX 내용 검증** | `python3 tools/verify-hwpx-markers.py <file> MARKER1 MARKER2` |

---

## 🎓 Self-Learning Protocol

1. **실수 발생 시** → `docs/lessons-learned.md` 에 한 줄 추가 + 관련 규칙(R1~R8)에 **실수 이력** 업데이트
2. **같은 작업 반복 시** → `skills/` 에 workflow markdown 추가
3. **무엇이 망가졌을 때** → `hooks/` 에 가드 스크립트 추가 + `tools/` 에 검증 도구 추가

이 파일은 "규칙을 한 줄이라도 빠뜨릴 바에는 덜 자신있는 설명을 쓴다" 원칙으로 작성됐다.

---

## 📚 Related Documents

- `docs/adr/` — 왜 이렇게 설계했는지 (Architecture Decision Records)
- `docs/lessons-learned.md` — 과거 실수 레지스트리
- `skills/` — 반복 workflow 저장소
- `hooks/` — 자동화 가드레일
- `tools/` — 검증 스크립트 + 프롬프트
