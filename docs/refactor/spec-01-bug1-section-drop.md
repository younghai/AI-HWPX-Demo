# SPEC-BUG-1 — 섹션 누락 수정 + Phase 0 안전망

> **작성:** Claude (Fable 5, 감사·설계) · **구현:** Codex GPT-5.5 xhigh
> **작성일:** 2026-07-10 · 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) §3 BUG-1, §4 Phase 0
> **커밋 규약:** Codex는 **구현 + 테스트만, 커밋 금지**. Claude가 감사 후 커밋(`Co-Authored-By: Codex GPT-5.5 <noreply@openai.com>`).

---

## 배경 (확증된 버그)

`apply_smart_replacements`(`scripts/build_hwpx.py:284-488`)는 AI 섹션을 **템플릿 heading 슬롯**에 매핑한다. 여기서:
- `sections`(`:316,341`) = 템플릿에서 검출된 heading 문단 리스트(= 슬롯).
- `toc`(인자) = AI 섹션 헤딩 리스트(= `draft.toc = sections.map(s.heading)`), `len(toc)` = AI 섹션 수.

**결함:** 신규 섹션 삽입 분기가 `if not sections and toc`(`:365`) — **템플릿에 heading이 0개일 때만** 발동. 채우기 루프는 `for i, sec in enumerate(sections)` + `if i >= len(toc): break`(`:407-409`)로 **슬롯 수만큼만** 순회. 따라서:

| 케이스 | 현재 동작 | 판정 |
|---|---|---|
| 슬롯 0개 + AI N개 | `:365` 분기가 N개 삽입 | 정상 (`test_no_outline_*`가 커버) |
| 슬롯 K개 = AI N개 | 1:1 채움 | 정상 |
| 슬롯 K개 > AI N개 | 앞 N개 채움, 초과 슬롯 heading 유지·body 블랭크(`:481-485`) | 정상(의도된 INV-2) — **유지 필수** |
| **슬롯 K개(>0) < AI N개** | 앞 K개만 채움, **`toc[K:]` 섹션 조용히 소실** | **BUG-1 (HIGH)** |

`:365` 분기는 `sections`가 비지 않으면 안 뜨고, `:481-485` 블랭킹은 `sections`(K개)만 순회하므로 소실분(N−K)을 잡지 못한다. 핵심 불변식 **"N AI 섹션 → 정확히 N HWPX 섹션"**(CLAUDE.md R6) 위반.

**도달 경로:** 편집기 "섹션 추가"(`client/src/hooks/useDraft.js:293`)로 슬롯 초과, 또는 heading 수가 적은 커스텀 템플릿 업로드(`--template-file`).

**커버리지 갭(Phase 0 확인):** `scripts/tests/test_mapper_gaps.py`·`test_pipeline.py`에 `0 < K < N` 케이스 **없음**.

---

## 대상 파일

- `scripts/build_hwpx.py` — `apply_smart_replacements` (삽입 로직).
- `scripts/tests/test_mapper_gaps.py` — 회귀 테스트 추가(또는 신규 `test_section_overflow.py`).
- (선택) `CLAUDE.md` 또는 `docs/refactor/00-*` — Phase 0 CI 게이트 1줄 명문화.

---

## 변경 설계

### 1. 삽입 헬퍼 추출 (중복 제거 + 버그 수정의 토대)

`:365-405`(zero-section 삽입)과 신규 overflow 삽입은 **동일 작업**("앵커 뒤에 heading+body 문단 시퀀스를 body_template 복제로 삽입, heading 스타일 지정, 문장 분할, `parent_of` 갱신")이다. 공용 헬퍼로 추출:

```python
def _insert_sections_after(parent, anchor_para, toc_names, sections_body,
                           body_template, heading_style_id, parent_of):
    """anchor_para 바로 뒤에 toc_names 각 항목을 (heading + 본문문장들) 문단으로 삽입.
    - body_template 을 deepcopy+normalize 해 구조 유지
    - heading 문단은 heading_style_id 로 설정(없으면 미설정)
    - 본문은 _split_body_sentences 로 분할
    - 삽입 요소를 parent_of 에 등록(기존 재인덱스 루프와 동일 규약)
    - 마지막으로 삽입된 문단 Element 를 반환(체이닝용)"""
```

- **zero-section 분기(`:365-405`)를 이 헬퍼 호출로 치환.** 앵커=`meta_para or title_para`, `toc_names=toc`. 기존 body_template 탐색(`:368-383`)·`heading_style_id = sorted(heading_ids)[0]`(`:385`) 로직은 헬퍼 호출 전 준비로 유지.

### 2. Overflow 분기 추가 (BUG-1 수정 본체)

채우기 루프(`:407-474`) **직후, 블랭킹 블록(`:481-485`) 앞**에 추가:

```
if len(toc) > len(sections) and sections:
    remaining = toc[len(sections):]           # 소실되던 섹션들
    last_sec = sections[-1]
    anchor = <last_sec 의 문서상 마지막 문단>   # heading_p·body_ps·이번 pass에서 복제된 문단 포함
    body_template = <최적 body 문단>            # 아래 폴백 체인
    heading_style_id = sorted(heading_ids)[0] if heading_ids else None
    _insert_sections_after(parent, anchor, remaining, sections_body,
                           body_template, heading_style_id, parent_of)
```

- **앵커(마지막 문단) 산정 — 주의:** 마지막 슬롯 섹션은 채우기 루프의 overflow-문장 분기(`:462-474`)에서 `body_ps[-1]` 뒤에 클론이 추가됐을 수 있다. 앵커는 "`parent` 자식 중 `last_sec` 소속 문단(heading_p ∪ body_ps ∪ 이번 pass 클론)의 최대 인덱스 위치"여야 한다. 안전 구현책: 채우기 루프에서 각 섹션의 마지막 삽입 문단을 추적하거나, overflow 삽입 시점에 `parent` 를 스캔해 `last_sec['body_ps']`(있으면 마지막, 없으면 `heading_p`) 이후 연속된 클론까지 포함한 위치를 계산. **정확한 앵커가 이 수정의 유일한 난점 — 아래 테스트로 순서를 검증한다.**
- **body_template 폴백 체인:** `last_sec['body_ps'][-1]` → (없으면) 임의 섹션의 첫 body_p → (전부 없으면) `heading_p` 를 복제하되 `styleIDRef=body_style_id` 강제(zero-section 분기의 폴백과 동일, `:434-436`).
- **heading 스타일:** overflow heading 문단은 반드시 `heading_style_id` 로 설정 — 그래야 실제 heading으로 렌더되고 `_heading_texts`(styleIDRef 필터)·이후 다이어그램 `afterSection` 매칭이 작동.

### 3. 불변식 보존 (변경 금지)

- **템플릿 > AI(INV-2)**: `len(toc) <= len(sections)` 이면 신규 코드 **미발동** → `:481-485` 블랭킹 그대로. `test_normal_template_unchanged_by_mapper_fixes`(문단수 44) 반드시 유지.
- **zero-section**: 헬퍼로 치환하되 동작 동일 → `test_no_outline_usage_falls_back_to_insertion` 유지.
- 표 구조·title·parity(`test_pipeline.py`) 전부 유지.

---

## 수용 기준

1. **슬롯 < AI(K>0):** 템플릿 슬롯보다 많은 toc(각 고유 body 마커)로 빌드 시 **모든 toc heading이 출력에 존재(순서 보존)**, **모든 body 마커가 정확히 1회** 등장, **누락 0**.
2. overflow 섹션의 **다문장 본문**이 전부 반영(문장 수만큼 문단).
3. overflow 섹션은 **마지막 템플릿 섹션 뒤, toc 순서대로** 배치.
4. **회귀 무변경:** 템플릿>AI(문단수 44), zero-section, slotless, 표구조, parity, 결정성 테스트 전부 GREEN 유지.
5. `--doc-date` 고정 시 **결정적** 출력(overflow 경로 포함).
6. placeholder/보일러플레이트 누수 없음(overflow 본문도 `_normalize_paragraph` 경유).

---

## 테스트 조건 (Codex가 추가)

먼저 **기존 전체 GREEN 베이스라인 확인**: `cd scripts && python -m pytest tests/ -q` (또는 repo 관행). 그 후 아래를 추가(초기 RED → 수정 후 GREEN):

- **T1 (RED→GREEN) 슬롯<AI 핵심:** gonmun 템플릿 + `toc` 8개(고유 heading, 각 고유 body 마커 `OVF_1..OVF_8`). 빌드 후 `Contents/section0.xml`에서:
  - `_heading_texts(xml)` 가 8개 toc를 **순서대로 모두 포함**.
  - 각 `OVF_k` 마커가 **정확히 1회**.
  - (gonmun 슬롯 수 K와 무관하게) 누락 0 — "N AI→N HWPX" 직접 인코딩.
- **T2 다문장 overflow:** overflow 섹션 본문을 `"문장1. 문장2. 문장3."` 로 주고 3개 문장 문단이 모두 존재.
- **T3 순서:** 마지막 템플릿 섹션의 본문 마커 뒤에 첫 overflow heading이 오는지(문서 순서) 확인.
- **T4 회귀:** 기존 `test_normal_template_unchanged_by_mapper_fixes`(44) · `test_no_outline_*` · `test_build_parity_*` · `test_table_structure_survives_build` 재실행 GREEN.

테스트는 기존 `_build_hwpx`/`_section_xml`/`_heading_texts`/`_paragraph_count` 헬퍼(`test_mapper_gaps.py:21-76`) 재사용.

---

## 위험

- **중.** `parent_of` 그림자 트리 + 삽입 인덱스 조작 — 파일 내 최고 난도 영역(부록 C §4). **앵커 산정**이 핵심 리스크. Phase 0 골든(T4) 아래에서만 진행하고, T1~T3로 신규 경로를 잠근 뒤 병합.
- overflow 헬퍼 추출로 zero-section 분기가 함께 바뀌므로 `test_no_outline_*` 로 동치성 확인 필수.
- 이 수정은 **국소 패치**다. `apply_smart_replacements` 전면 분해는 Phase 2(SPEC-P2)에서 — 여기서 과도한 리팩토링 금지(리스크 격리).

---

## Codex 위임 지시 (요약)

> `scripts/build_hwpx.py`의 섹션 누락 버그를 위 설계대로 수정하고 회귀 테스트를 추가하라. **구현 + `python -m pytest scripts/tests/` GREEN 확인까지 하고, 절대 커밋하지 마라**(작업트리에 미커밋으로 남겨라). 기존 테스트(특히 문단수 44, no-outline, parity)를 깨지 말 것. 완료 후 변경 파일 목록과 pytest 결과 요약을 보고하라.
