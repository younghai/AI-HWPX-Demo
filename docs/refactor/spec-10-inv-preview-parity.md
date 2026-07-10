# SPEC-INV — python 출력 정합·품질 배치 (INV-2 · INV-3 · INV-5 · INV-6)

> **작성·구현:** Claude (Fable 5) 직접(승인된 모드) · **작성일:** 2026-07-10
> 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) §3 INV-2/3/5/6. 근거: [appendix/C](appendix/C-python.md) §9.
> **결정 원칙:** 네 항목 모두 프로젝트의 절대 원칙(CLAUDE.md: "미리보기에 보이는 내용 = 다운로드 파일 내용")에서 답이 도출된다 — 별도 제품 결정 없이 원칙 적용으로 확정하고, 여기 근거를 남긴다.

---

## INV-2 — toc 초과 템플릿 heading 블랭킹 [행동 변경]

**현행:** AI 섹션 수 < 템플릿 heading 슬롯이면 초과 슬롯의 body만 비우고 **heading 텍스트는 원본 유지**(`sections.py` P0 FIX 주석: "사용자가 수동 편집할 수 있도록").
**문제:** 편집기(미리보기)에는 N개 섹션뿐인데 다운로드에는 템플릿 잔여 heading이 추가로 보임 → **preview≠download**.
**결정:** heading도 body처럼 블랭킹. "수동 편집" 근거는 인앱 편집기(PO-01) 도입 이전의 것 — 이제 섹션 추가는 편집기에서 하고(BUG-1이 슬롯 초과 삽입 처리), 다운로드 파일을 손으로 고치는 흐름이 아님. 문단은 **비우기만**(제거 아님)이라 문단 수·구조 불변.

## INV-3 — PrvText.txt 실제 내용 반영 [행동 변경]

**현행:** `update_preview`가 문서 내용과 무관한 고정 보일러플레이트("프로세스/1. HWPX 압축 해제…")를 씀 → 한컴/파일관리자의 텍스트 미리보기 패널이 본문과 다른 내용을 표시.
**결정:** 제목 + `<원본: …>` + 섹션(heading/body) 실제 내용으로 생성(4000자 방어 캡). `run()`이 `section_items`를 전달.

## INV-5 — `_normalize_paragraph` 적용 불가 시 관찰 가능성 [비행동 — 로깅만]

**현행:** run 없음/텍스트 전용 run 없음이면 **조용히 no-op** → 블랭킹 실패 시 placeholder가 산출물에 누수돼도 아무 신호가 없음.
**결정:** raise는 과함(이상 템플릿에서 빌드 전체가 죽음) — `logging.warning`(stderr → 서버 로그, R4 채널과 무관). 정상 경로(분류가 direct-text 문단만 정규화 대상으로 거름)에서는 발화하지 않음을 스위트로 확인.

## INV-6 — 문장 분할의 번호 매김 파손 방지 [행동 변경(신규 입력만)]

**현행:** `. ` 치환 분할이 "1. 자료 수집"을 `"1."`/`"자료 수집"` 두 문단으로 파손(AI 본문의 열거는 흔함). *감사의 "3.5 % 파손" 예시는 부정확 — 소수점은 점+공백이 아니라 애초에 분리 안 됨.*
**결정:** 최소 규칙 — 분할 후 **번호만 남은 조각(`^\d{1,2}\.$`)을 다음 조각에 병합**. 기존 스위트의 본문(BUG-1 T2 "문장1. 문장2." 포함)은 standalone 번호가 없어 출력 불변.

## 대상 파일

`scripts/hwpx/sections.py`(블랭킹 루프+주석) · `scripts/build_hwpx.py`(update_preview+run 배선) · `scripts/hwpx/paragraphs.py`(INV-5 warning, INV-6 병합) · 테스트(test_mapper_gaps: INV-2 / test_pipeline: INV-3·5·6).

## 수용 기준 (전부 RED-provable, INV-5 제외)

1. INV-2: gonmun(5슬롯)+2섹션 빌드 시 `_heading_texts` == **정확히 그 2개**(템플릿 잔여 heading 부재). *(구코드: 잔여 3개 노출 → RED)*
2. INV-3: PrvText.txt에 제목·heading·본문 마커 존재 + "HWPX 압축 해제" 보일러플레이트 부재. *(구코드 RED)*
3. INV-6: `"준비 단계다. 1. 자료 수집. 2. 검토를 진행한다."` → 3조각(번호가 붙은 채). *(구코드 5조각 → RED)*
4. INV-5: run 없는 문단에 텍스트 쓰기 시도 시 warning 발화(caplog).
5. 기존 41 pytest 무수정 GREEN(블랭킹은 카운트 불변·`_heading_texts`는 빈 heading 제외·기존 본문에 standalone 번호 없음) + server 45 + client 33.

## 위험

- **낮음.** INV-2가 가장 큰 행동 변화이나 정확히 절대 원칙 방향이고, 문단 구조 불변이라 카운트류 골든 유지. 출고 샘플(templates/samples)은 5-toc 기본이라 무영향.
- INV-6은 병합 규칙이 보수적(standalone 번호만) — 부분 개선임을 명시(문두 "본문 1." 류는 미커버).
