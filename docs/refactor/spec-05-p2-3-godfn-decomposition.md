# SPEC-P2.3 — god-function 분해 (fields · io · diagrams · sections)

> **작성:** Claude (Fable 5) · **구현:** Claude 직접(Codex 위임 차단, 사용자 승인 2026-07-10) + 자가검증(전체 테스트 + 전/후 section0.xml 바이트 diff)
> **작성일:** 2026-07-10 · 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) Phase 2, [appendix/C](appendix/C-python.md) §8
> 선행: P2.1(namespaces·paragraphs) `8c1e579`, P2.2(ParentIndex) `fe96d71`.

---

## 목표

`build_hwpx.py`에 남은 도메인 로직을 `hwpx/` 서브모듈로 분해해 monolith를 해소한다. **모든 단계 behavior-preserving**(전/후 section0.xml 바이트 동일 + 기존 39 pytest/38 server 무수정 GREEN). 테스트/픽스처가 참조하는 `build_hwpx._*` 심볼은 **import 재노출로 유지**한다.

## 안전 분할 (각 단계 독립 커밋 + 바이트 검증)

| 단계 | 이동 대상 | 신규 모듈 | 위험 |
|---|---|---|---|
| **P2.3a** | `_normalize_field_label`·`_match_field`·`_cell_first_text`·`_cell_fill_paragraph`·`_apply_label_value_fields` / `SectionsParseError`·`load_sections_body`·`load_doc_fields` | `hwpx/fields.py`, `hwpx/io.py` | LOW (순수 이동) |
| **P2.3b** | `_diagram_png_bytes`·`_cairosvg_available`·`_has_valid_client_png`·`embed_diagrams` | `hwpx/diagrams.py` | LOW (순수 이동 — **문자열 XML 그대로 유지**) |
| **P2.3c** | `detect_heading_style_ids`·`_insert_sections_after`·`apply_smart_replacements`(classify/map/fill) | `hwpx/sections.py` | MED (핵심 로직, ParentIndex/paragraphs와 결합) |

**중요 — 범위 제외(의도적):** `embed_diagrams`의 문자열로 조립한 `<hp:pic>` XML을 ET 요소 빌더(`build_pic_paragraph`)로 바꾸는 개선은 **직렬화가 달라져 바이트 불변이 깨진다**. 따라서 P2.3에서는 하지 않고, diagram-parity 테스트를 갖춘 **별도 비-바이트-동일 변경**으로 미룬다. P2.3b는 embed_diagrams를 문자열 XML째로 옮기기만 한다.

`cli.py`(parse_args/run/main) 분리는 선택 — build_hwpx.py를 CLI 엔트리로 유지해도 무방하므로 이번 P2.3 범위에서 제외(필요 시 후속).

## 검증 규약(모든 단계 공통)

1. `./.venv/bin/python -m pytest scripts/tests/ -q` → 39 passed 무변경.
2. 대표 입력(8섹션 overflow + 다문장, `--doc-date` 고정)으로 리팩토링 전(stash)·후 section0.xml **바이트 diff → 동일**.
3. `build_hwpx.py --help` exit 0. `pnpm -C server test` 38.
4. 이동 함수는 build_hwpx.py에서 `def`가 사라지고 import로만 존재.

## 진행

- ✅ **P2.3a** — fields.py + io.py (byte-identical, 39 passed).
- ⏳ P2.3b — diagrams.py (문자열 XML 유지).
- ⏳ P2.3c — sections.py (classify/map/fill + apply_smart_replacements).
