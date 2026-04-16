# Service Overview / 서비스 소개

## Korean

### 개요

AI HWPX Demo는 기존 HWPX 문서의 스타일, 문단 구조, 섹션 흐름을 유지한 채 텍스트 내용만 새로 치환해 결과 문서를 생성하는 데모 서비스입니다.

이 프로젝트는 HWPX를 ZIP 기반 XML 컨테이너로 다루며, 내부적으로 `Contents/header.xml`, `Contents/content.hpf`, `Contents/section*.xml`, `Preview/PrvText.txt` 같은 핵심 파일을 기준으로 문서를 분석하고 다시 구성합니다.

### 해결하는 문제

- 기존 한글 양식을 버리지 않고 새 문서를 빠르게 만들기 어려움
- 공공 문서, 제안서, 사업계획서, 회의록처럼 정형 포맷이 필요한 문서는 스타일 재구성이 번거로움
- AI 초안은 쉽게 만들 수 있어도 최종 한글 문서 구조에 다시 옮기는 작업이 큼

### 데모 흐름

1. 사용자가 원본 `.hwpx` 파일을 업로드합니다.
2. 제목과 목차를 입력하거나 예시 버튼으로 문서 유형을 선택합니다.
3. 시스템이 HWPX를 압축 해제하고 XML 본문을 분석합니다.
4. 텍스트 노드를 새 내용으로 치환합니다.
5. 다시 `.hwpx`로 묶고 다운로드 링크를 제공합니다.

### 지원 문서 유형 예시

- 회의록
- 사업계획서
- 제안서
- RFP

### 구현 특징

- HWPX 내부 구조 기반 처리
- 템플릿 스타일 재사용
- 브라우저 미리보기와 실제 HWPX 생성 흐름 연결
- PHP + Python 기반의 가벼운 로컬 데모 구조

## English

### Overview

AI HWPX Demo is a local demo service that replaces only the textual content of an HWPX document while preserving its original style, paragraph structure, and section flow.

The project treats HWPX as a ZIP-based XML container and rebuilds documents around key files such as `Contents/header.xml`, `Contents/content.hpf`, `Contents/section*.xml`, and `Preview/PrvText.txt`.

### Problems It Solves

- It is hard to create new Korean documents quickly without rebuilding an existing HWPX template by hand.
- Structured documents such as public forms, proposals, business plans, and meeting minutes require strict layout preservation.
- AI can draft content easily, but moving that content back into a properly formatted HWPX document is still a manual task in many workflows.

### Demo Flow

1. The user uploads an original `.hwpx` file.
2. The user enters a title and table of contents, or selects one of the example document types.
3. The system unpacks the HWPX archive and analyzes the XML body structure.
4. The text nodes are replaced with newly generated content.
5. The document is packed back into `.hwpx` format and returned through a download link.

### Example Document Types

- Meeting Minutes
- Business Plan
- Proposal
- RFP

### Implementation Highlights

- Direct processing of internal HWPX structure
- Reuse of original template styles
- Connected browser preview and actual HWPX generation flow
- Lightweight local demo built with PHP and Python
