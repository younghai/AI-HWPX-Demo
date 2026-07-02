# AI HWP — HWP 템플릿 기반 AI 문서 생성 서비스

HWP/HWPX 템플릿을 업로드하고 목차·내용을 입력하면, **기존 템플릿 양식을 그대로 유지한 채** AI가 회의록·사업계획서·제안서·공문서 등의 본문을 생성해 HWPX로 내려받는 로컬 서비스입니다.

- **미리보기 = 다운로드 파일** (바이트 동일성 보장)
- localhost에서 독립 실행 — 외부 경로 의존 없음 (`scripts/`, `templates/` 내장)
- 원본: [younghai/AI_hwp](https://github.com/younghai/AI_hwp) 의 v4를 독립 repo로 추출

> 🧭 **작업 시작 전 반드시 읽을 것**: [`CLAUDE.md`](./CLAUDE.md) — 절대 규칙(R1~R8), 실수 이력, 아키텍처 제약
> 📚 **의사결정 배경**: [`docs/adr/`](./docs/adr/) · 📘 **실수 레지스트리**: [`docs/lessons-learned.md`](./docs/lessons-learned.md)

---

## 🚀 Quick Start

```bash
# 요구사항: Node 20+, pnpm 10, Python 3.9+
pnpm install                               # workspace 설치 (client + server)
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # 다이어그램용 (선택)

cp server/.env.example server/.env         # AI API 키 입력 (UI에서 입력해도 됨)
pnpm run dev                               # client(5192) + server(8792) 동시 실행
```

- **클라이언트**: http://127.0.0.1:5192
- **서버 API**: http://127.0.0.1:8792
- 자동 로그인 모드: `pnpm run dev:auto` (client 5193 + server 8793)

AI API 키는 두 가지 방법으로 설정:
1. `server/.env` 파일에 직접 입력 (`ANTHROPIC_API_KEY` 등 — 서버 재시작 필요)
2. UI 우측 상단 **프로바이더 설정**에서 입력 → `server/.env`에 자동 저장

> 💡 API 키 없이도 실행·업로드·미리보기·HWPX 내보내기는 동작합니다. AI 초안 생성만 키가 필요합니다.

## 🎨 기능

- **HWP/HWPX 업로드** — 드래그앤드롭 + 클릭, 파일 크기/페이지 수/형식 표시 (extension + MIME + magic bytes 3중 검증)
- **rhwp 로컬 파싱** — 첫 페이지 SVG 렌더, 본문 텍스트 추출 (브라우저 내 WASM, 파일이 외부로 나가지 않음)
- **문서 타입** — 보고서 / 제안서 / 회의록 / 공문서 / 기본 문서 (타입별 목차 템플릿 제공)
- **AI 초안 생성** — Anthropic Claude / OpenAI / Kimi / xAI (API 키 저장 + OAuth 지원)
- **다이어그램 자동 삽입** — flowchart / timeline / comparison (cairo 설치 시 PNG로 임베드)
- **HWPX 내보내기** — 양식 유지 + AI 본문 치환 + 구조 검증(validation) 후 다운로드

### 다이어그램 사전 요건 (선택)

SVG → PNG 변환에 네이티브 `libcairo`가 필요합니다. 없으면 다이어그램만 생략되고 나머지는 정상 동작합니다.

```bash
brew install cairo          # macOS (서버가 /opt/homebrew/lib 을 자동 탐색)
apt-get install libcairo2   # Debian/Ubuntu
```

## 📂 폴더 구조

```
.
├── CLAUDE.md               # 🧭 절대 규칙 + 실수 이력 (작업 시작점)
├── shared/                 # client+server 공용 (escape, validate, docTypes)
│
├── server/                 # Express (Node.js) — port 8792
│   ├── index.js            # 부트스트랩 (~35줄)
│   ├── lib/                # errors, env, oauth, session, upload, providers-config, utils
│   ├── services/           # ai, draft, hwpxBuilder, validator, polarisValidator
│   └── routes/             # health, providers, auth, googleAuth, draft, export, samples
│
├── client/                 # React + Vite — port 5192
│   └── src/
│       ├── App.jsx         # 조합만 (~135줄)
│       ├── lib/            # diagrams, helpers
│       ├── hooks/          # useRhwp, useDraft, useProviders, useToast
│       └── components/     # TopBar, ProviderSettings, ControlPanel, PreviewPanel, …
│
├── scripts/                # Python 워커 — Node가 spawn (build_hwpx.py 등)
├── templates/              # HWPX 템플릿 + 샘플 문서
├── specs/                  # docType별 polaris 검증 규칙
│
├── docs/adr/               # Architecture Decision Records
├── docs/lessons-learned.md # 실수 레지스트리
├── skills/                 # 재사용 워크플로우 (markdown)
├── hooks/                  # 자동화 가드레일 (shell)
└── tools/                  # 검증 스크립트 (smoke-test, verify-hwpx-markers)
```

## 🧪 검증 명령

| 목적 | 명령 |
|------|------|
| **완료 선언 전 필수 검증** | `bash hooks/pre-completion-checklist.sh` |
| 단독 E2E 스모크 테스트 | `bash tools/smoke-test.sh` |
| HWPX 마커 검증 | `python3 tools/verify-hwpx-markers.py <hwpx_path> MARKER1 ...` |
| 클라이언트 프로덕션 빌드 | `pnpm -C client build` |
| 서버 syntax 체크 | `cd server && for f in index.js lib/*.js services/*.js routes/*.js; do node --check "$f"; done` |

## 🔁 의존성 변경 후 필수 절차

`package.json` 수정, `pnpm install`, 또는 "이상한 캐시 문제" 체감 시:

```bash
bash hooks/post-deps-change.sh   # 프로세스 kill + Vite cache 삭제
pnpm run dev                     # dev 서버 재시작
# 브라우저에서 Cmd+Shift+R (하드 리프레시)
bash tools/smoke-test.sh         # 정상성 재검증
```

## 📜 Self-Learning Protocol

프로젝트는 사용 중 **스스로 학습**하도록 설계:

1. **실수 발생** → `docs/lessons-learned.md` 맨 위 항목 추가 + `CLAUDE.md` 관련 규칙에 이력 업데이트
2. **같은 작업 반복** → `skills/<workflow>.md` 추가
3. **망가지는 케이스** → `hooks/*.sh` 에 가드 + `tools/*` 에 검증 도구 추가

자세한 사용법은 [`CLAUDE.md`](./CLAUDE.md) 참고.

## 🔗 참고

- 문서 파싱/렌더링: [`@rhwp/core`](https://www.npmjs.com/package/@rhwp/core) (`0.7.17` exact pin — R2 규칙)
- HWPX 빌더: [`scripts/build_hwpx.py`](./scripts/build_hwpx.py) (repo 내장)
