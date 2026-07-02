# API 설계서 (API Design Document)

| 항목 | 내용 |
|------|------|
| **프로젝트명** | HWP/HWPX AI 문서 생성 데모 서비스 (v4) |
| **문서 버전** | v1.4 |
| **작성일** | 2026-04-20 |
| **최종 수정일** | 2026-04-25 |
| **작성자** | 개발팀 |
| **문서 상태** | 승인됨 |

---

## 1. 개요

### 1.1 API 스타일

- **RESTful HTTP API**
- **Base URL**: `http://127.0.0.1:8792`
- **Content-Type**: `application/json` (파일 업로드 제외)
- **CORS**: `CLIENT_ORIGIN`에서만 허용

### 1.2 인증

- API Key 기반: 서버 `.env` 또는 클라이언트에서 전달 (Provider 설정용)
- OAuth 2.0: 일부 Provider 지원 (로컬 콜백)

---

## 2. 엔드포인트 명세

### 2.1 Health Check

#### GET /api/health

**설명**: 서버 상태 확인

**Request**: 없음

**Response**:
```json
{
  "status": "ok",
  "mode": "local-rhwp-demo"
}
```

**Status Codes**: 200 OK

---

### 2.2 Provider 관리

#### GET /api/providers

**설명**: 지원 AI Provider 목록 및 설정 상태 조회

**Response**:
```json
{
  "providers": [
    {
      "key": "anthropic",
      "label": "Anthropic Claude",
      "configured": true,
      "defaultModel": "claude-sonnet-4-20250514",
      "supportsOAuth": false
    },
    {
      "key": "openai",
      "label": "OpenAI",
      "configured": false,
      "defaultModel": "gpt-4o",
      "supportsOAuth": true
    }
  ],
  "activeProvider": "anthropic"
}
```

**Status Codes**: 200 OK

---

#### POST /api/settings

**설명**: Provider API 키 저장

**Request Body**:
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-..."
}
```

**Response**:
```json
{
  "ok": true,
  "provider": "anthropic"
}
```

**Status Codes**: 200 OK, 400 Bad Request

---

#### POST /api/test-provider

**설명**: Provider 연결 테스트

**Request Body**:
```json
{
  "provider": "anthropic",
  "apiKey": "sk-ant-..."
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Hello, this is a test response from Claude."
}
```

**Status Codes**: 200 OK, 401 Unauthorized, 502 Bad Gateway

---

### 2.3 Google OAuth 인증

#### GET /auth/google

**설명**: Google OAuth 로그인 시작 (또는 Mock 로그인 폼)

**동작**:
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`이 설정된 경우: Google OAuth 2.0 authorize URL로 리디렉션
- 미설정 또는 placeholder인 경우: HTML Mock 로그인 폼 반환

**Response** (Mock 모드):
- `Content-Type: text/html`
- 이메일/이름 입력 폼 + "Mock 로그인" 버튼

---

#### GET /auth/google/callback

**설명**: Google OAuth 콜백 (code → token → userinfo 교환)

**Query Parameters**:
| 파라미터 | 설명 |
|----------|------|
| `code` | Google authorization code |
| `state` | CSRF 방지용 상태 토큰 |

**동작**:
1. `code`를 `access_token`으로 교환
2. Google userinfo API로 사용자 정보 조회
3. 세션 생성 (`v2_session` 쿠키 설정, 24h TTL)
4. 팝업 모드: `window.opener.postMessage({type:'google-auth-result', success:true})` 후 창 닫기
5. 리디렉션 모드: `CLIENT_ORIGIN`으로 리디렉션

**Status Codes**: 200 OK (팝업), 302 Redirect, 400 Bad Request, 500 Internal Server Error

---

#### GET /api/me

**설명**: 현재 로그인한 사용자 정보 조회

**Request**: `Cookie: v2_session=<sid>`

**Response** (로그인 상태):
```json
{
  "authenticated": true,
  "user": {
    "email": "user@example.com",
    "name": "홍길동",
    "picture": "https://..."
  }
}
```

**Response** (미로그인):
```json
{
  "authenticated": false,
  "user": null
}
```

**Status Codes**: 200 OK

---

#### POST /api/logout

**설명**: 로그아웃 및 세션 삭제

**Request**: `Cookie: v2_session=<sid>`

**Response**:
```json
{
  "ok": true
}
```

**동작**: 세션 저장소에서 `sid` 제거 + `v2_session` 쿠키 삭제

**Status Codes**: 200 OK

---

### 2.4 초안 생성

#### POST /api/generate-draft

**설명**: AI 문서 초안 생성

**Request Body** (`application/json`):
```json
{
  "sourceText": "추출된 원본 문서 텍스트...",
  "docType": "report",
  "companyName": "Bizmatrixx",
  "goal": "업로드한 문서의 핵심 내용을 바탕으로 임원 검토용 초안을 만들어 주세요.",
  "notes": "핵심 메시지는 유지하고, 목차는 더 명확하게 재구성해 주세요.",
  "fileName": "uploaded.hwp",
  "targetTitle": "2026년 1분기 업무 보고서",
  "aiProvider": "anthropic",
  "aiApiKey": ""
}
```

**Response**:
```json
{
  "ok": true,
  "draft": {
    "title": "2026년 1분기 업무 보고서",
    "summary": "Bizmatrixx의 2026년 1분기 주요 업무 성과와 추진 방안을 요약한 보고서 초안입니다.",
    "toc": ["서비스 추진 배경", "현황 및 문제 분석", "세부 추진 방안", "기대 효과", "일정 및 추진 체계"],
    "sections": [
      {
        "heading": "서비스 추진 배경",
        "body": "2026년 1분기에는 디지털 전환 가속화와 고객 경험 혁신을 twin 목표로 설정하였습니다..."
      }
    ],
    "diagrams": [
      {
        "_diagram": true,
        "afterSection": "세부 추진 방안",
        "type": "flowchart",
        "title": "추진 프로세스",
        "data": ["기획", "분석", "설계", "구현", "검증"]
      }
    ],
    "sourceExcerpt": ["1분기 실적", "주요 과제", "다음 분기 계획"],
    "engine": "Anthropic Claude"
  }
}
```

**Status Codes**: 200 OK, 400 Bad Request, 401 Unauthorized, 502 Bad Gateway

**Error Response**:
```json
{
  "ok": false,
  "error": "AI 호출 실패: timeout"
}
```

---

### 2.4 HWPX 납품

#### POST /api/export-hwpx

**설명**: AI 초안을 기반으로 HWPX 파일 생성

**Request Body** (`multipart/form-data`):
| 필드 | 타입 | 필수 | 설명 |
|------|------|------|------|
| `title` | text | Y | 문서 제목 |
| `toc` | text | N | 개행 구분 목차 |
| `sections` | text (JSON) | Y | 섹션 배열 JSON 문자열 |
| `diagrams` | text (JSON) | N | 다이어그램 배열 JSON 문자열 |
| `sourceFile` | file | N | 원본 업로드 파일 |
| `sourceMode` | text | N | `hwpx-template` 또는 `hwp-source` |
| `sourceText` | text | N | 추출된 원본 텍스트 |

**Response**:
```json
{
  "ok": true,
  "fileName": "2026년-1분기-업무-보고서-1713600000000.hwpx",
  "downloadUrl": "/generated/2026년-1분기-업무-보고서-1713600000000.hwpx",
  "message": "업로드한 문서 내용을 바탕으로 기본 HWPX 양식의 새 문서를 생성했습니다."
}
```

**Status Codes**: 200 OK, 422 Unprocessable Entity, 500 Internal Server Error

---

### 2.5 샘플 문서 (신규)

> `server/routes/samples.js` 라우터. `createAuthRouter`는 v4에서 마운트되지 않는다.

#### GET /api/samples

**설명**: 샘플 문서 목록 조회

**Response**:
```json
{
  "samples": [
    {
      "id": "gonmun-basic",
      "label": "공문서 기본 양식",
      "description": "표준 공문서 형식의 HWPX 기본 양식",
      "downloadUrl": "/api/samples/gonmun-basic/file"
    }
  ]
}
```

**Status Codes**: 200 OK

---

#### GET /api/samples/:id/file

**설명**: 샘플 HWPX 파일 다운로드

**Path Parameters**:
| 파라미터 | 설명 |
|----------|------|
| `id` | 샘플 ID (예: `gonmun-basic`) |

**Response**: `application/octet-stream` (HWPX 파일)

**Status Codes**: 200 OK, 404 Not Found

---

### 2.6 정적 파일

#### GET /generated/*

**설명**: 생성된 HWPX 파일 정적 제공

**Response**: `application/octet-stream` (HWPX 파일 다운로드)

---

### 2.7 Google OAuth 인증 (신규)

> 신규 라우터 `server/routes/googleAuth.js`. `cookie-parser` 및 CORS `credentials: true` 필요.

#### GET /auth/google

**설명**: Google OAuth authorize 리다이렉트 시작

**Request**: 없음

**Response**: 302 Redirect → `https://accounts.google.com/o/oauth2/v2/auth?...`

**환경 변수**:
- `GOOGLE_CLIENT_ID` (필수)
- `OAUTH_REDIRECT_BASE` (선택, 기본 `http://127.0.0.1:8792`)

---

#### GET /auth/google/callback

**설명**: Google OAuth code → 토큰 교환 → 사용자 프로필 조회 → 세션 쿠키 발급

**Query**: `code`, `state`

**Response**: 팝업 창에서 `window.opener.postMessage({type: 'auth-result', success, user})` 후 `window.close()`

**Set-Cookie**: `session=<opaque>; HttpOnly; SameSite=Lax; Max-Age=<TTL>`

**Status Codes**: 200 OK (성공/실패 모두 HTML 페이지 반환)

---

#### GET /auth/session

**설명**: 현재 세션의 사용자 조회 (클라이언트 폴링용)

**Request**: `Cookie: session=...`

**Response**:
```json
{
  "user": {
    "email": "user@example.com",
    "name": "User Name",
    "picture": "https://..."
  }
}
```

또는 비로그인 시:
```json
{ "user": null }
```

---

#### POST /auth/logout

**설명**: 세션 쿠키 무효화

**Response**:
```json
{ "ok": true }
```

**Set-Cookie**: `session=; Max-Age=0`

---

## 3. 에러 코드 정의

| HTTP 상태 코드 | 의미 | 발생 상황 |
|----------------|------|-----------|
| 400 | Bad Request | 필수 파라미터 누락, 지원하지 않는 Provider |
| 401 | Unauthorized | API 키 미설정, 키 형식 오류 |
| 422 | Unprocessable Entity | 제목 누락, HWPX 양식 기반 납품 시 원본 파일 누락 |
| 500 | Internal Server Error | Python 빌드 스크립트 예외, 파일 시스템 오류 |
| 502 | Bad Gateway | AI Provider API 호출 실패, 응답 파싱 실패 |

---

## 4. API 버저닝

현재 v4 데모는 버저닝 없이 단일 엔드포인트 세트로 운영된다. 향후 SaaS 전환 시 `/api/v1/` prefix를 도입할 것을 권장한다.

**v4 인증 라우터 참고**: `createAuthRouter` (OpenAI/Kimi OAuth)는 v4에서 마운트되지 않으며, `googleAuthRouter`만 사용된다.


---

## 5. 변경 이력

| 버전 | 날짜 | 작성자 | 변경 내용 |
|------|------|--------|-----------|
| v1.0 | 2026-04-20 | 개발팀 | 초안 작성 |
| v1.1 | 2026-04-21 | 개발팀 | Google OAuth 엔드포인트 추가 (`/auth/google`, `/auth/google/callback`, `/api/me`, `/api/logout`) |
| v1.2 | 2026-04-21 | 개발팀 | 인증 방식에 메모리 세션 + cookie-parser 반영 |
| v1.3 | 2026-04-22 | 개발팀 | Mock 로그인 폭백, CORS credentials, dual-port 배포 반영 |
| v1.4 | 2026-04-25 | 개발팀 | 샘플 문서 API 추가, `createAuthRouter` 미사용 명시, package 이름/의존성 반영 |
