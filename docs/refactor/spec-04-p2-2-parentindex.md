# SPEC-P2.2 — ParentIndex: parent_of 그림자 트리 캡슐화

> **작성:** Claude (Fable 5, 감사·설계) · **구현:** Codex GPT-5.5 xhigh
> **작성일:** 2026-07-10 · 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) Phase 2, [appendix/C](appendix/C-python.md) §4·§10-rec1
> **커밋 규약:** Codex는 구현 + 테스트만, **커밋 금지**(미커밋 유지).
> **Codex 실행 주의:** 반드시 `-C /Users/young/Downloads/personal_project/hwp_demo` (writable root).

---

## 배경

ElementTree에 부모 포인터가 없어 `apply_smart_replacements`는 `parent_of` dict(그림자 트리)를 만들고, **삽입할 때마다 손으로 재인덱스**한다. 이 "insert + 3줄 reindex" 패턴이 **4곳에 복붙**되어 있다(appendix C §4 — 파일 내 최대 손상 위험 구조. 한 곳만 빠뜨려도 이후 `list(parent).index()`가 조용히 깨짐):

| 위치(현재 라인) | 맥락 |
|---|---|
| `_insert_sections_after` `:114-136` | zero-section/overflow 공용 헬퍼 |
| 채우기 빈-body 분기 `:339-351` | `body_count==0` 섹션에 문장 삽입 |
| 채우기 overflow 분기 `:366-379` | 문장>슬롯 초과분 삽입 |
| `parent_of` 생성 `:224` | 초기 맵 구축 |

**목표:** `parent_of` + 재인덱스를 `ParentIndex` 클래스(`hwpx/eltree.py`)로 캡슐화하고 삽입을 `insert_after()`로 통일 → 4곳 복붙 제거. **behavior-preserving**(로직 무변경, 39 pytest + 38 server 무수정 GREEN).

> **범위 제외:** `embed_diagrams`(`:641`)의 `parent=root` 직접 삽입은 그림자 트리를 쓰지 않는 별개 로직이라 **이번 단계에서 건드리지 않는다**(향후 채택 가능하나 리스크 격리 위해 제외).

---

## 대상/신규 파일

- 신규 `scripts/hwpx/eltree.py`
- 수정 `scripts/build_hwpx.py` (`_insert_sections_after` + `apply_smart_replacements`)

**테스트/기타 파일 무수정.**

---

## 변경 설계

### 1. `scripts/hwpx/eltree.py` — ParentIndex

```python
from __future__ import annotations
import xml.etree.ElementTree as ET


class ParentIndex:
    """ElementTree root 의 child→parent 맵을 소유하고, 맵을 자동으로 일관되게
    유지하는 삽입 헬퍼를 제공한다. (ET 는 부모 포인터가 없어, 문단 삽입 후
    위치 계산을 위해 부모 맵이 필요하다.) apply_smart_replacements 에 흩어진
    '삽입 + 수동 재인덱스' 복붙을 대체한다."""

    def __init__(self, root: ET.Element) -> None:
        self._parent: dict[ET.Element, ET.Element] = {
            child: parent for parent in root.iter() for child in parent
        }

    def parent_of(self, el: ET.Element) -> ET.Element | None:
        return self._parent.get(el)

    def insert_after(self, anchor: ET.Element, new_el: ET.Element) -> ET.Element:
        """anchor 바로 뒤(같은 부모 내)에 new_el 삽입, new_el 을 맵에 등록, new_el 반환.
        anchor 의 부모가 맵에 없으면 KeyError (호출부가 parent_of 로 사전 확인)."""
        parent = self._parent[anchor]
        parent.insert(list(parent).index(anchor) + 1, new_el)
        self._track(new_el, parent)
        return new_el

    def _track(self, el: ET.Element, parent: ET.Element) -> None:
        self._parent[el] = parent
        for child in el.iter():
            for grand in child:
                self._parent[grand] = child
```

**등가성(핵심):** 기존 `insert_idx = index(anchor)+1; for k: parent.insert(insert_idx+k, clone_k)`는 clone들을 anchor 뒤에 순서대로 넣는다. `cur=anchor; for: cur=insert_after(cur, clone)` 체이닝도 **동일 순서**(각 clone을 직전 요소 뒤에). 따라서 XML 출력 바이트 불변(`test_doc_date_is_deterministic`가 가드).

### 2. `_insert_sections_after` 리팩토링 (`:105-137`)

시그니처를 `(index: ParentIndex, anchor_para, toc_names, sections_body, body_template, heading_style_id)`로 변경(`parent`·`parent_of` 파라미터 제거). 본문을 체이닝으로:

```python
def _insert_sections_after(index, anchor_para, toc_names, sections_body,
                           body_template, heading_style_id):
    cur = anchor_para
    for section_name in toc_names:
        heading_clone = _clone_paragraph_for_text(body_template, section_name)
        if heading_style_id is not None:
            heading_clone.set("styleIDRef", heading_style_id)
        cur = index.insert_after(cur, heading_clone)
        for sentence in _split_body_sentences(sections_body.get(section_name, "")):
            cur = index.insert_after(cur, _clone_paragraph_for_text(body_template, sentence))
    return cur
```

### 3. `apply_smart_replacements` 리팩토링 (`:201-415`)

- `:224` `parent_of = {...}` → `index = ParentIndex(root)`.
- **zero-section 분기(`:282-305`):** `parent = index.parent_of(anchor_para)` 가드 유지 → `_insert_sections_after(index, anchor_para, toc, sections_body, body_template, heading_style_id)`.
- **빈-body 분기(`:339-352`):** 
  ```python
  if index.parent_of(sec['heading_p']) is not None:
      cur = sec['heading_p']
      for sentence in sentences:
          clone = _clone_paragraph_for_text(template_body, sentence)
          if style_override is not None:
              clone.set("styleIDRef", style_override)
          cur = index.insert_after(cur, clone)
      section_anchor = cur
  last_section_anchor = section_anchor
  ```
- **overflow 분기(`:366-380`):**
  ```python
  if len(sentences) > body_count and body_ps and index.parent_of(body_ps[-1]) is not None:
      cur = body_ps[-1]
      for extra_sentence in sentences[body_count:]:
          cur = index.insert_after(cur, _clone_paragraph_for_text(body_ps[-1], extra_sentence))
      section_anchor = cur
  last_section_anchor = section_anchor
  ```
- **overflow-섹션 분기(BUG-1, `:382-402`):** `parent = index.parent_of(anchor_para)` 가드 → `_insert_sections_after(index, anchor_para, remaining, sections_body, body_template, heading_style_id)`.
- build_hwpx.py 상단에 `from hwpx.eltree import ParentIndex` 추가.

> **주의:** `section_anchor`/`last_section_anchor` 추적(BUG-1 앵커)은 체이닝 커서 `cur`가 마지막 삽입 문단이므로 **`section_anchor = cur`로 그대로 보존**. 빈-body/overflow 분기에서 삽입이 0건이면 `section_anchor`는 초기값(`body_ps[-1]` 또는 `heading_p`) 유지(기존과 동일).

---

## 수용 기준

1. `hwpx/eltree.py`에 `ParentIndex`(`parent_of`/`insert_after`/`_track`) 생성.
2. `apply_smart_replacements`·`_insert_sections_after`에서 **수동 `parent_of[...] = ...` 재인덱스 루프 4곳이 모두 제거**되고 `ParentIndex`로 대체.
3. **로직·출력 무변경**: 삽입 순서·개수·스타일 동일 → XML 바이트 동일.
4. BUG-1 불변식 유지: 슬롯<AI 섹션 시 누락 0, 순서 보존(회귀 T1/T2/T3 GREEN).
5. **기존 39 pytest + 38 server 무수정 GREEN.**
6. `embed_diagrams` 미변경.

---

## 테스트 조건

- **테스트 추가 없음**(순수 구조 리팩토링). 기존 테스트가 회귀 가드. 테스트 파일 수정 금지.
- 검증: `cd /Users/young/Downloads/personal_project/hwp_demo && ./.venv/bin/python -m pytest scripts/tests/ -q` → **39 passed** 유지. `pnpm -C server test` → 38 passed. 스모크 `build_hwpx.py --help` 0.
- 특히 `test_gonmun_eight_section_build_keeps_all_headings_and_bodies`(BUG-1 오버플로)·`test_first_overflow_heading_follows_last_template_section_body`(순서)·`test_doc_date_is_deterministic`(바이트 결정성)가 반드시 GREEN — ParentIndex 등가성 증거.

---

## 위험

- **중.** BUG-1 삽입 로직과 직접 맞물림. 그러나 체이닝 등가성이 명확하고(위 §1) 39 테스트(오버플로·순서·결정성 포함)가 즉시 회귀를 잡는다.
- 유일 함정: 빈-body/overflow 분기에서 삽입 0건일 때 `section_anchor` 초기값 보존 — 위 설계대로 처리하면 기존과 동일.
- **스코프 규율:** ParentIndex + 위 2함수만. god-function 분해(sections/fields/diagrams 모듈화)는 **P2.3**. embed_diagrams·validators·gen_*·office 미변경.

---

## Codex 위임 지시 (요약)

> **먼저 `-C /Users/young/Downloads/personal_project/hwp_demo`로 Codex 실행.** 위 설계대로 `hwpx/eltree.py`에 `ParentIndex`를 만들고, `build_hwpx.py`의 `_insert_sections_after`·`apply_smart_replacements`에서 수동 `parent_of` 재인덱스 4곳을 `ParentIndex.insert_after` 체이닝으로 대체하라. **순수 리팩토링 — 삽입 순서/개수/출력 바이트 불변, 테스트 파일 수정 금지.** `./.venv/bin/python -m pytest scripts/tests/ -q`(39 passed 무변경) + `pnpm -C server test`(38) GREEN 확인하고 커밋하지 마라(미커밋). 완료 후 git status, 변경 요약, 실제 pytest/server 요약 보고. 39 passed 무변경 아니면 성공 주장 금지.
