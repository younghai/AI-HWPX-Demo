# Usage / 사용 방법

## Korean

### 브라우저에서 사용하는 순서

1. 원본 `.hwpx` 파일을 업로드합니다.
2. 예시 버튼 중 하나를 선택하거나 제목과 목차를 직접 입력합니다.
3. 오른쪽 결과물 미리보기를 확인합니다.
4. `실행` 버튼을 눌러 실제 HWPX 문서를 생성합니다.
5. `완성된 파일 다운로드` 버튼으로 결과 파일을 내려받습니다.

### 예시 버튼 설명

#### 회의록

- 회의 개요
- 주요 논의 사항
- 결정 사항
- 후속 액션
- 공유 일정

#### 사업계획서

- 사업 배경
- 시장 기회
- 서비스 구성
- 수익 모델
- 추진 일정

#### 제안서

- 제안 개요
- 핵심 기능
- 구축 방식
- 운영 지원
- 예상 효과

#### RFP

- 사업 개요
- 과업 범위
- 기술 요건
- 평가 기준
- 제출 안내

### 실제 생성 방식

- 원본 HWPX 압축 해제
- `mimetype` 유지 및 패키지 구조 보존
- `header.xml` 의 스타일 정의는 유지
- `Contents/section0.xml` 텍스트 노드 치환
- `Preview/PrvText.txt` 갱신
- `content.hpf` 메타데이터 제목 갱신
- HWPX 재압축

## English

### Browser Flow

1. Upload an original `.hwpx` file.
2. Select one of the example buttons or enter your own title and table of contents.
3. Review the generated output preview on the right side.
4. Click `실행` to generate the actual HWPX document.
5. Click `완성된 파일 다운로드` to download the generated file.

### Example Button Types

#### Meeting Minutes

- Meeting Overview
- Main Discussion Points
- Decisions
- Follow-up Actions
- Shared Schedule

#### Business Plan

- Business Background
- Market Opportunity
- Service Structure
- Revenue Model
- Rollout Timeline

#### Proposal

- Proposal Overview
- Core Features
- Delivery Approach
- Operations Support
- Expected Benefits

#### RFP

- Project Overview
- Scope of Work
- Technical Requirements
- Evaluation Criteria
- Submission Guide

### Actual Generation Process

- Unpack the original HWPX file
- Preserve the `mimetype` entry and package layout
- Keep style definitions from `header.xml`
- Replace text nodes in `Contents/section0.xml`
- Update `Preview/PrvText.txt`
- Update the title metadata in `content.hpf`
- Repack everything into a new HWPX file
