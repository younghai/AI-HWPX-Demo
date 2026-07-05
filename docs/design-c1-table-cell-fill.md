# C1 설계 노트 — 표 셀(라벨/값) 치환

> 상태: **구현 완료.** `build_hwpx.py::_apply_label_value_fields` + `--doc-fields`,
> 서버 플러밍(`shared/docTypes.js::resolveDocFieldValues` → `hwpxBuilder` → export
> 라우트 → client `useDraft`), 골든 테스트 `scripts/tests/test_table_cell_fill.py`,
> 픽스처 `testdata/minutes-form.hwpx`(+ `scripts/gen_table_fixture.py`).
> 회귀 가드 `test_pipeline.py::test_table_structure_survives_build` 는 계속 통과한다.
> 아래 본문은 구현 이전의 설계 근거를 역사적 기록으로 남겨둔다.

## 현재 동작 (조사 결과)

`apply_smart_replacements`는 `root.iter('hp:p')`로 **표 셀 내부 단락까지 포함해**
모든 텍스트 단락을 문서 순서대로 순회하며 title/meta/heading/body로 분류한다.
즉 표 셀은 "건너뛰는" 게 아니라 이미 일반 단락과 동일하게 인덱스 기반으로
처리되고 있다. (`_normalize_paragraph`가 건너뛰는 것은 표를 *담고 있는* 래퍼
단락 — 직접 텍스트가 없어서다.)

gonmun 템플릿 실측:
- 표 2개 / 셀 6개
- **문서 제목이 표 셀 안에 있고**, 현재 로직이 이를 TITLE로 올바르게 치환한다
- "폰트 HY헤드라인M, 크기 18" 같은 서식 힌트 셀은 body 슬롯으로 분류되어 빈
  값으로 정리된다(R5 의도대로)

따라서 **버그는 없다.** 현재 인덱스 매핑이 이 템플릿에서 우연히 잘 동작한다.

## 진짜 C1이 필요한 경우

사용자가 **라벨/값 표 폼**을 가진 자체 템플릿을 올릴 때다. 예: 회의록의
`| 일시 | ______ |`, `| 참석자 | ______ |` 또는 공문의 `| 발신 | ______ |`.
현재는 이런 값 셀이 인덱스 순서상 body/heading 슬롯으로 잡혀 AI 본문이나 TOC
항목으로 잘못 채워지거나, 라벨 셀이 덮어써질 수 있다. docFields(회의일시/참석자/
발신부서 — PO-04에서 이미 수집)를 **해당 값 셀에 정확히** 넣는 것이 목표.

## 안전한 구현 방향 (추가적, 저위험)

기존 인덱스 기반 body/heading 분류를 **건드리지 않고** 그 앞단에 라벨/값 패스를
추가한다:

1. **라벨/값 쌍 탐지**: 2열 표에서 왼쪽 셀 텍스트가 알려진 필드 라벨
   (docTypes.js `DOC_TYPE_META[*].fields[].label` + 동의어: "일시"↔"회의 일시" 등)
   과 매칭되면, 같은 행의 오른쪽 셀을 값 셀로 인식.
2. **값 셀 채우기**: 매칭된 값 셀 단락을 `_normalize_paragraph(value_p, docFields[key])`
   로 치환.
3. **분류에서 제외**: 라벨/값으로 소비된 셀 단락을 title/meta/heading/body 순회
   대상에서 빼서, 기존 인덱스 매핑이 흔들리지 않게 한다.
4. 매칭 실패 시 완전 no-op → 기존 동작 보존.

## 왜 이번에 구현하지 않았나

- **테스트 픽스처 부재**: 라벨/값 표를 가진 HWPX 템플릿이 repo에 없다. HWPX는
  압축 XML이라 안전한 픽스처를 손으로 만드는 것 자체가 R5 위험을 진다.
- **핵심 불변식 위험**: 이 코드는 "미리보기 = 다운로드" 미션과 R5(단락 정규화)/
  R6(N섹션↔N슬롯)이 얽힌 가장 민감한 지점이다. 검증 픽스처 없이 바꾸면 회귀
  위험이 크다.
- 따라서 **회귀 가드 테스트로 현재 동작을 먼저 고정**(plan의 "골든 테스트 확장
  선행")하고, 실제 기능은 라벨/값 표 픽스처를 확보한 별도 집중 작업으로 남긴다.

## 착수 시 체크리스트 (완료)

- [x] 라벨/값 표를 가진 최소 HWPX 픽스처 추가 — `testdata/minutes-form.hwpx`
      (`scripts/gen_table_fixture.py` 가 gonmun.hwpx 의 실제 셀을 복제해 결정적 생성)
- [x] 위 4단계 라벨/값 패스 구현 (분류 제외 포함) — `_apply_label_value_fields`
- [x] 골든 테스트: 값 셀만 채워지고 라벨 셀·표 구조·기존 body/heading 매핑 불변
      — `test_table_cell_fill.py::test_golden_label_value_fill_end_to_end`
- [x] `test_table_structure_survives_build` 계속 통과(회귀 없음)

## 구현 메모 (design → code 매핑)

- **매칭**(step 1): `_match_field` — NFC + 콜론/공백 제거 후 라벨 상호 부분문자열
  매칭(동의어 "일시"↔"회의 일시"), 1글자 트리비얼 매칭 방지.
- **값 채우기**(step 2): `_normalize_paragraph(value_p, value)` 재사용 → R5 준수
  (stale run 제거 + linesegarray 리셋). 빈 값 셀(빈 run)도 `<hp:t>` 생성해 채움.
- **분류 제외**(step 3): 매칭된 라벨·값 셀의 모든 `<hp:p>` 를 `consumed` set 으로
  모아 Pass 1 순회에서 `continue` → 기존 title/heading/body 인덱스 불변.
- **no-op**(step 4): `doc_fields` 빈/매칭 실패 시 `consumed` 는 빈 set → 완전 무변경.
- **플러밍**: 라벨은 `docTypes.js` 가 단일 진실원. 서버가 `resolveDocFieldValues`
  로 `{key,label,value}`(빈 값·미선언 키 제거) 를 만들어 `--doc-fields` JSON 으로
  전달. 잘못된 payload 는 무시(본문 생성은 계속) — 부가 기능이므로 빌드 실패 금지.
