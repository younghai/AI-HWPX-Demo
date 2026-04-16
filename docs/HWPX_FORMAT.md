# HWPX Format Reference / HWPX 포맷 레퍼런스

## Korean

### 개요

HWPX는 한글 문서를 위한 ZIP 기반 XML 컨테이너 포맷이며, 내부적으로 여러 XML과 부가 리소스를 묶는 패키지 구조를 가집니다. 이 저장소는 그 구조를 직접 다뤄서 텍스트만 치환하고, 스타일과 레이아웃은 유지하는 방식으로 동작합니다.

### 기본 패키지 구조

```text
document.hwpx
├── mimetype
├── META-INF/
│   ├── container.xml
│   ├── container.rdf
│   └── manifest.xml
├── Contents/
│   ├── content.hpf
│   ├── header.xml
│   ├── section0.xml
│   ├── section1.xml
│   └── ...
├── Preview/
│   ├── PrvImage.png
│   └── PrvText.txt
├── settings.xml
└── version.xml
```

### 이 프로젝트에서 중요하게 보는 파일

- `mimetype`: HWPX 패키지 식별 정보. 아카이브 첫 엔트리로 유지하는 것이 중요합니다.
- `Contents/content.hpf`: 패키지 메타데이터와 문서 구성 목록을 담습니다.
- `Contents/header.xml`: 폰트, 문단 스타일, 글자 스타일, 테두리/배경 같은 전역 서식을 정의합니다.
- `Contents/section*.xml`: 실제 본문 텍스트, 문단, 표, 컨트롤이 들어 있는 핵심 파일입니다.
- `Preview/PrvText.txt`: 미리보기 텍스트입니다.

### XML 처리 관점에서의 핵심 포인트

- 문단은 주로 `hp:p`
- 텍스트 런은 `hp:run`
- 실제 텍스트는 `hp:t`
- 문단 스타일은 `paraPrIDRef`
- 런 문자 스타일은 `charPrIDRef`
- 스타일 자체 정의는 `header.xml` 에 존재

### 이 데모의 처리 원칙

1. HWPX를 압축 해제합니다.
2. `header.xml` 의 스타일 정보는 유지합니다.
3. `section0.xml` 의 비어 있지 않은 `hp:t` 노드를 찾아 새 텍스트로 치환합니다.
4. `content.hpf` 의 제목 메타데이터를 갱신합니다.
5. `Preview/PrvText.txt` 를 갱신합니다.
6. `mimetype` 를 포함한 전체 구조를 다시 `.hwpx` 로 패키징합니다.

### 관련 네임스페이스 예시

- `hp`: 문단, 런, 텍스트, 표
- `hs`: 섹션 루트
- `hc`: 코어 데이터 타입
- `hh`: 헤더 및 스타일 정의
- `hpf`: 매니페스트
- `opf`: 패키지 메타데이터

## English

### Overview

HWPX is a ZIP-based XML container format for Hancom documents. This repository works directly with that package structure so it can replace textual content while preserving the original visual style and layout.

### Basic Package Layout

```text
document.hwpx
├── mimetype
├── META-INF/
│   ├── container.xml
│   ├── container.rdf
│   └── manifest.xml
├── Contents/
│   ├── content.hpf
│   ├── header.xml
│   ├── section0.xml
│   ├── section1.xml
│   └── ...
├── Preview/
│   ├── PrvImage.png
│   └── PrvText.txt
├── settings.xml
└── version.xml
```

### Files This Project Uses Most

- `mimetype`: Identifies the package as HWPX and should remain the first archive entry.
- `Contents/content.hpf`: Stores package metadata and the document manifest.
- `Contents/header.xml`: Defines global styles such as fonts, paragraph styles, character styles, and border/background settings.
- `Contents/section*.xml`: Stores the actual body content including paragraphs, tables, and controls.
- `Preview/PrvText.txt`: Stores the text preview used by the document preview layer.

### XML-Level Concepts

- Paragraphs are mainly stored in `hp:p`
- Text runs are stored in `hp:run`
- Actual text content is stored in `hp:t`
- Paragraph styling references use `paraPrIDRef`
- Character styling references use `charPrIDRef`
- Style definitions themselves live in `header.xml`

### Processing Rules Used in This Demo

1. Unpack the HWPX archive.
2. Preserve the style definitions from `header.xml`.
3. Find non-empty `hp:t` nodes in `section0.xml` and replace them with new content.
4. Update the title metadata in `content.hpf`.
5. Update `Preview/PrvText.txt`.
6. Repack the full directory into a new `.hwpx` file while preserving the package layout.

### Example Namespaces

- `hp`: paragraphs, runs, text, tables
- `hs`: section root
- `hc`: core data types
- `hh`: header and style definitions
- `hpf`: manifest
- `opf`: package metadata
