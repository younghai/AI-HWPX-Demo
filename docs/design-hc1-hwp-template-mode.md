# HC-1 설계 노트 — HWP 업로드 "양식 유지 모드" (hwpConverter 사이드카)

> 상태: **구현 완료 + 컨테이너 E2E 검증 통과 (2026-07-08).**
> B단계 512ff8c·e7617c7 / A단계 1b875cb·a9a621b·8744f9c / 픽스처 감사수정 772b489.
> 최종 증거: 컨테이너에서 HWP 업로드 → `templateMode: converted-hwp`, 본문 마커 각 1회,
> 원본 이미지 8개 보존, validator 에러 0, non-root 구동, "hwp converter available" 로그.
> 남은 후속(비차단): ① 클라 업로드 배너가 변환기 가용성을 모름 — .hwp 업로드 시
> "원본 서식은 유지되지 않습니다"가 변환기 있는 배포에선 부정확 → 서버 capability 노출
> + 조건부 문구. ② golden 04는 java+curl 있는 환경에서만 러너로 실행됨(호스트는 스킵,
> 컨테이너 E2E가 동등 검증을 대체).
> 작성: 감사자(계획·감사 lane). 구현: Codex 디스패치.

## 배경 / PoC 증거 (2026-07-08)

현재 `.hwp` 업로드는 "새 양식 생성 모드"로 강등된다(원본 서식 소실 — 최대 제품 갭).
[vsdn/hwpConverter](https://github.com/vsdn/hwpConverter) (Apache-2.0, 커밋 `9af63ea5e24f4761351559591a1b35dbdf3c78b3` 고정)로
HWP→HWPX 변환 후 기존 hwpx-template 경로를 재사용하는 PoC를 실측했다:

- `eclipse-temurin:8-jdk` 컨테이너(network none)에서 빌드: 192파일 컴파일 에러 0
- 실제 정부 문서 2종 변환 성공 (경기도 지방보조금 매뉴얼 736KB 포함)
- 변환본 구조: zip 무결 · mimetype 정상 · 스타일 테이블 완전 보존(개요1~7) · 이미지 8개 BinData 보존
- **우리 export 파이프라인 통과: validator 에러 0** (경고 4 = 정상 gonmun 빌드와 동일), 제목 치환·이미지 보존 정상
- 진입점: `kr.n.nframe.newfeature.HwpConverterCli` (`Hwp2Hwpx` + `HwpxPostProcessor.normalize` — 한글 2024 실측 기반 targetProgram별 layoutCompatibility 후처리)

## PoC가 밝힌 우리 쪽 선행 결함 (변환기 무관 — 한글 정품 파일도 동일)

`apply_smart_replacements`(scripts/build_hwpx.py)는 개요 스타일 문단을 heading으로 삼아
AI 본문을 분배하는데, **임의의 실문서**에서 두 가지로 깨진다:

- **갭ⓐ**: 개요 스타일이 헤더에 *정의*만 되고 **사용 문단이 0개** (poc-plain: 40문단 전부 바탕글류)
  → `sections=[]` → AI 본문이 들어갈 곳이 없어 **통째로 미주입** (조용히).
- **갭ⓑ**: heading은 있으나 **연속 배치라 body 슬롯이 0개** (poc-rich: 개요1 40개 목차형 배치)
  → `body_ps=[]`이면 클론 삽입 경로(`if len(sentences) > body_count and body_ps:`)가 스킵 → AI 문장 **조용히 소실**.

둘 다 R6("AI가 준 내용은 정확히 그만큼 반영, 소실 금지") 위반 부류다.

## 구현 계획

### B단계 — 매퍼 갭 수정 (선행, 기존 HWPX 업로드에도 이득)

`scripts/build_hwpx.py`만 수정. 원칙: **기존 정상 경로(개요+body 슬롯 있는 문서)는 바이트 단위로 무변경**이어야 한다.

- **B-ⓑ (핵심)**: 섹션의 `body_ps`가 비어 있으면, 그 섹션의 `heading_p` **바로 뒤에** 새 body 문단을 삽입해 문장을 넣는다.
  - 문단 원형: 문서 내 "본문형 문단" 1개를 골라 `_clone_paragraph_for_text` 재사용 — 우선순위: (1) 다른 섹션의 첫 body_p, (2) 없으면 heading_p를 클론하되 styleIDRef를 문서 최빈 본문 스타일로 교체.
  - 문장 N개면 문단 N개 삽입 (기존 overflow 클론 로직과 동일 규약).
  - `parent_of` 갱신 규약은 기존 overflow 삽입 코드와 동일하게.
- **B-ⓐ**: Pass 1 종료 후 `sections==[]`이고 `toc`가 비어있지 않으면, meta 문단(없으면 title 문단) **뒤에** `heading+body` 문단 쌍을 toc 순서대로 삽입.
  - heading 원형: heading 스타일 정의가 있으면(detect_heading_style_ids 결과 사용) 그 스타일로 새 문단 생성, 없으면 본문 스타일 + 그대로.
  - 원본의 나머지 내용은 **건드리지 않는다** (아래로 그대로 유지 — 양식 보존이 목적).
- 모든 신규 문단은 `_normalize_paragraph` 경유(R5), 직접 `.text=` 금지.

**테스트 (같은 커밋에 포함, 결정적 픽스처 생성기 사용):**
1. 픽스처 생성기 확장 또는 신규(`scripts/gen_mapper_fixtures.py`): gonmun.hwpx 기반으로
   (i) 개요 미사용 픽스처(모든 문단 바탕글화), (ii) 연속 heading·body 0 픽스처 — 두 개를 결정적으로 생성.
2. pytest 신규:
   - `test_body_slotless_heading_inserts_paragraphs`: 갭ⓑ 픽스처 → 마커 문장이 정확히 N회, heading 텍스트 불변, 표 구조 불변.
   - `test_no_outline_usage_falls_back_to_insertion`: 갭ⓐ 픽스처 → toc 헤딩+본문이 title/meta 뒤에 삽입, 원본 잔여 내용 보존.
   - `test_normal_template_byte_stable`: **정상 gonmun 경로의 출력이 수정 전과 동일**함을 고정 (--doc-date 고정, 수정 전 출력을 커밋 전에 생성해 비교하거나 구조 assert로 대체).
3. 기존 스위트(30) + golden 1~3 전부 그린.

### A단계 — 변환기 배선 (B 병합 후)

- `tools/fetch-hwpconverter.sh`: 커밋 `9af63ea5...` 고정 clone → **docker(temurin:8-jdk)로 빌드**(mkdir -p build/classes 선행 — JDK8 javac는 -d 자동생성 안 함) → `vendor/hwpconverter/{hwpConverter.jar,lib/*.jar,NOTICE}` 산출. `vendor/`는 .gitignore.
  - 주의(이 맥 한정): colima가 bind mount를 안 태우므로 스크립트는 `docker cp` 패턴으로 작성.
- `server/services/hwpConvert.js` (신규): `convertHwpToHwpx(inputPath, outDir)` — `java -Xmx512m -cp "<jar>:<lib>/*" kr.n.nframe.newfeature.HwpConverterCli in.hwp out.hwpx`, 60s 타임아웃, 실패/자바부재 시 `null` 반환(graceful).
  - 가용성 판정: `JAVA_BIN`(기본 `java`) 실행 가능 + jar 존재. 부팅 시 1회 로그.
- `hwpxBuilder.js`: sourceFile이 `.hwp`이고 변환기 가용하면 workDir에서 HWPX로 변환 → `templatePath`로 사용. 응답에 `templateMode: 'converted-hwp' | 'hwpx' | 'generated'` 추가(클라 배너는 후속).
- Dockerfile: 멀티스테이지에 temurin 빌드 스테이지 추가 + 런타임에 JRE(headless) 설치 + vendor 복사. 이미지 증가 ~+200MB 허용.
- golden 04: `.hwp` 입력 → 변환 → 본문 마커+bindata 검증. **java/jar 부재 시 SKIP** (polaris 스킵 패턴).
- 라이선스: `NOTICE` 파일에 hwpConverter(Apache-2.0)·hwplib 계열 표기.

## 리스크 가드
- B는 "미리보기=다운로드" 심장부 수정 → `test_normal_template_byte_stable`이 회귀 방화벽.
- A의 신뢰 경계: 업로드 파일을 JVM(POI/OLE2)에 넘김 → 타임아웃+기존 20MB 제한+임시파일 즉시 삭제. 장기적으로 사이드카 컨테이너 분리 옵션.
- 변환 fidelity는 문서별 상이 → templateMode를 응답에 남겨 KPI(변환 성공률) 추적 여지.
