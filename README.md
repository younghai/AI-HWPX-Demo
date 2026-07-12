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

> 💡 **API 키 없이도 전체 흐름을 체험할 수 있습니다.** 키가 없으면 "데모" 프로바이더가 자동 선택되어 예시 초안을 생성합니다(실제 AI 아님). 실제 AI 생성만 키가 필요합니다. 편집 중인 초안은 자동 저장되어 새로고침해도 복구할 수 있습니다.

### 🔐 외부 배포 (protected 모드)

로컬 기본값은 `AUTH_MODE=local`(인증 없음, 단일 사용자용)입니다. 외부/팀에 공개하려면 `server/.env`에서 아래를 설정하세요 (자세한 항목은 [`server/.env.example`](server/.env.example) 참고):

```bash
AUTH_MODE=protected          # 상태 변경·비용·다운로드 라우트에 Google 로그인 세션 강제
NODE_ENV=production          # mock 로그인 비활성 + 쿠키 secure(HTTPS)
GOOGLE_CLIENT_ID=...         # protected 모드는 Google OAuth 필요
GOOGLE_CLIENT_SECRET=...
```

protected 모드에서는 인증 게이트·rate limit·helmet·산출물 격리·zip/XXE 방어가 활성화됩니다. HTTPS 프록시 뒤에서 운영하세요.

### 🐳 Docker (단일 컨테이너 배포)

Node·Python·libcairo(다이어그램용)·한글 폰트가 모두 포함된 단일 이미지로, 하나의 프로세스가 API와 빌드된 SPA를 함께 서빙합니다. **호스트에 cairo/폰트가 없어도 다이어그램 임베딩이 그대로 동작**합니다.

```bash
docker compose up --build            # 빌드 후 http://127.0.0.1:8792
# 또는 직접:
docker build -t ai-hwp .
docker run -p 8792:8792 ai-hwp
```

- 실제 AI 키/OAuth 시크릿은 이미지에 굽지 않습니다 — 런타임에 주입하세요. `cp server/.env.example .env` 후 채우면 `docker compose`가 자동 로드합니다(`.env`, 선택).
- 외부 공개 시 `AUTH_MODE=protected` + `NODE_ENV=production` + `GOOGLE_CLIENT_ID/SECRET` + HTTPS 프록시를 함께 설정하세요.
- 프로덕션 서버는 `HOST=0.0.0.0`으로 바인딩되며(컨테이너 기본), 로컬 직접 실행은 `127.0.0.1`이 기본입니다.

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

## ⚖️ 라이선스

이 저장소는 [MIT License](./LICENSE)로 배포됩니다.

Docker 이미지에 번들되는 HWP→HWPX 변환기 [vsdn/hwpConverter](https://github.com/vsdn/hwpConverter)는
**Apache-2.0**이며 별도 고지를 따릅니다 — [`NOTICE`](./NOTICE) 및 이미지 내
`vendor/hwpconverter/LICENSE-hwpConverter` 참조 (repo에는 소스가 포함되지 않고 빌드 시 지정 커밋을 받아옵니다).
