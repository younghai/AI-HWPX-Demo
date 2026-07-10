# SPEC-P2.1 — hwpx/ 패키지 착수: namespaces + paragraphs 추출

> **작성:** Claude (Fable 5, 감사·설계) · **구현:** Codex GPT-5.5 xhigh
> **작성일:** 2026-07-10 · 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) Phase 2, [appendix/C](appendix/C-python.md) §8·§10
> **커밋 규약:** Codex는 구현 + 테스트만, **커밋 금지**(미커밋 유지). Claude 감사 후 커밋.
> **Codex 실행 주의:** 반드시 `-C /Users/young/Downloads/personal_project/hwp_demo`로 실행(writable root). 아니면 쓰기가 조용히 실패한다.

---

## 배경 · 목표

`scripts/build_hwpx.py`(~855줄)는 CLI·네임스페이스·문단 정규화·섹션 분류·다이어그램·pack을 한 파일에 담은 god-script다(appendix C §8). **P2는 이를 `scripts/hwpx/` 패키지로 3단계 분해**하며, **P2.1은 가장 순수하고 저위험인 두 조각을 먼저 추출**한다:

1. **namespaces** — NS URI 상수·등록·`qn()` 헬퍼·`_safe_parse` (7개 파일에 중복된 URI의 단일 출처 기반).
2. **paragraphs** — 순수 문단 헬퍼 6종.

**절대 원칙: behavior-preserving.** 로직 변경 0, 순수 이동 + import. 기존 39 pytest + 38 server 테스트가 **무변경으로 GREEN** 유지되어야 한다.

---

## 대상/신규 파일

- 신규 `scripts/hwpx/__init__.py` (빈 패키지 마커, 또는 편의 re-export)
- 신규 `scripts/hwpx/namespaces.py`
- 신규 `scripts/hwpx/paragraphs.py`
- 수정 `scripts/build_hwpx.py` (정의 제거 + import)

**이번 범위에서 건드리지 않음:** `validators/**`, `gen_*.py`, `office/**`, `tools/**`, `diagram_templates.py`, 테스트 파일. (그들의 NS 중복 정리는 이후 단계.)

---

## 변경 설계

### 1. `scripts/hwpx/namespaces.py`

`build_hwpx.py`에서 아래를 **이동**:
- 상수 `HP`, `HH` (line 34-35) + 나머지 NS URI들(현재 register 루프 안에 인라인, line 42-57)을 **명명 상수**로: `HA, HP10, HS, HC, HHS, HM, HPF, DC, OPF, OOXMLCHART, EPUB, CONFIG`.
- `NAMESPACES` dict (line 37-40) — `update_metadata`가 `root.find(".//opf:title", NAMESPACES)`에 사용하므로 유지.
- `register_namespace` 루프 (line 42-58) — **import 시 1회 실행**되도록 모듈 최상위에 배치(부작용 유지). build_hwpx가 namespaces를 import하면 등록됨.
- `_safe_parse` (line 17-20, defusedxml 폴백 포함) — 파싱 인프라이므로 여기로.
- **신규 헬퍼 추가** `def qn(local: str, ns: str = HP) -> str: return f"{{{ns}}}{local}"` — Clark 표기 생성. (paragraphs.py가 사용.)

```python
# scripts/hwpx/namespaces.py (구조 예시)
import xml.etree.ElementTree as ET
try:
    from defusedxml.ElementTree import parse as _safe_parse
except ImportError:
    _safe_parse = ET.parse

HP  = "http://www.hancom.co.kr/hwpml/2011/paragraph"
HH  = "http://www.hancom.co.kr/hwpml/2011/head"
HS  = "http://www.hancom.co.kr/hwpml/2011/section"
# … 나머지 URI 상수 …
NAMESPACES = {"opf": OPF, "hp": HP}
_PREFIX_URI = { "ha": HA, "hp": HP, "hp10": HP10, "hs": HS, "hc": HC, "hh": HH,
                "hhs": HHS, "hm": HM, "hpf": HPF, "dc": DC, "opf": OPF,
                "ooxmlchart": OOXMLCHART, "epub": EPUB, "config": CONFIG }
for _prefix, _uri in _PREFIX_URI.items():
    ET.register_namespace(_prefix, _uri)

def qn(local: str, ns: str = HP) -> str:
    return f"{{{ns}}}{local}"
```

### 2. `scripts/hwpx/paragraphs.py`

`build_hwpx.py`에서 아래 **순수 함수 6종을 이동**(line 131-220):
`_is_text_only_run`, `_paragraph_has_direct_text`, `_direct_text_first`, `_normalize_paragraph`, `_split_body_sentences`, `_clone_paragraph_for_text`.

- 내부의 `f"{{{HP}}}..."` 리터럴은 `qn("run")`, `qn("t")`, `qn("linesegarray")`, `qn("lineseg")` 등 **`qn()` 호출로 치환**(동작 동일, 가독성↑). 이게 이 단계의 유일한 "표현" 변경이며 로직은 불변.
- `from hwpx.namespaces import qn, HP` import.
- `_clone_paragraph_for_text`는 `_normalize_paragraph`를 호출하므로 같은 모듈 내 유지(순환 없음).

### 3. `scripts/build_hwpx.py` 수정

- 최상위 `_safe_parse` try/except 블록(17-20) 제거 → `from hwpx.namespaces import _safe_parse` 로 대체.
- `HP/HH/NAMESPACES/register 루프`(34-58) 제거 → `from hwpx.namespaces import HP, HH, NAMESPACES, qn` (register는 namespaces import 시 실행).
- 문단 헬퍼 6종 정의(131-220) 제거 → `from hwpx.paragraphs import (_is_text_only_run, _paragraph_has_direct_text, _direct_text_first, _normalize_paragraph, _split_body_sentences, _clone_paragraph_for_text)`.
- **중요(테스트 호환):** 이 import 문들이 곧 **re-export** 역할을 한다 — `build_hwpx._normalize_paragraph`, `build_hwpx._direct_text_first`, `build_hwpx._paragraph_has_direct_text`, `build_hwpx._safe_parse` 등이 테스트/픽스처에서 참조되는데, import된 이름은 build_hwpx 모듈 속성이 되므로 **참조가 그대로 유효**하다. (별도 `__all__`/명시 re-export 불요.)
- build_hwpx.py의 **나머지 함수들**(detect_heading_style_ids, apply_smart_replacements, embed_diagrams 등)에 남은 `f"{{{HP}}}..."` 리터럴은 **이번 단계에서 건드리지 않는다**(그 함수들이 이후 단계에서 각자 모듈로 이동하며 정리). 스코프 최소화.

### import 경로 주의
- `scripts/` 는 이미 `sys.path`에 삽입됨(build_hwpx.py:22-28, conftest.py, gen_*). 따라서 `from hwpx.namespaces import ...` (패키지 import)가 동작하려면 `scripts/hwpx/__init__.py` 존재 + `scripts/` on path면 충분.
- `hwpx/` 패키지는 `office/hwpx_utils.py`(모듈)와 **이름이 다르므로 충돌 없음**.
- hwpx 서브모듈 간 import는 절대(`from hwpx.namespaces import qn`) 또는 상대(`from .namespaces import qn`) 중 **하나로 일관**. (권장: 절대 — 기존 코드 관례와 일치.)

---

## 수용 기준

1. `scripts/hwpx/namespaces.py`, `scripts/hwpx/paragraphs.py`, `scripts/hwpx/__init__.py` 생성.
2. build_hwpx.py에서 해당 정의가 제거되고 import로 대체됨. NS register 부작용 유지.
3. **로직 무변경**: 이동된 함수의 동작이 이전과 100% 동일(qn() 치환은 문자열상 동일 결과).
4. `build_hwpx._normalize_paragraph`/`._direct_text_first`/`._paragraph_has_direct_text`/`._safe_parse` 등 테스트가 참조하는 심볼이 **여전히 접근 가능**.
5. **기존 39 pytest + 38 server 테스트가 무변경으로 GREEN.** (테스트 파일 수정 금지 — 순수 리팩토링이므로 기존 테스트가 곧 회귀 가드.)
6. `python -c "import build_hwpx"` 및 `python scripts/build_hwpx.py --help` 정상.

---

## 테스트 조건

- **테스트 추가 없음** — 이 단계는 순수 구조 이동이라 기존 테스트가 회귀 가드다. Codex는 테스트 파일을 수정하지 말 것.
- 검증: `cd /Users/young/Downloads/personal_project/hwp_demo && ./.venv/bin/python -m pytest scripts/tests/ -q` → **39 passed** 유지. 스모크: `./.venv/bin/python scripts/build_hwpx.py --help` 정상 종료.
- (server 테스트는 python 구조 변경과 무관하나, 한 번 돌려 38 passed 확인 권장.)

---

## 위험

- **낮음.** 순수 이동. 유일 리스크는 (a) import 경로/패키지 인식 실패, (b) register 부작용 누락, (c) 테스트가 참조하는 심볼 접근성 상실 — 셋 다 기존 39 테스트가 즉시 잡는다.
- `qn()` 치환은 문자열 동치이므로 XML 출력 바이트 불변(결정성 테스트 `test_doc_date_is_deterministic`가 가드).
- **스코프 규율:** namespaces + paragraphs만. detect_heading_style_ids·god-function·validators·gen_*·office는 **다음 단계**. 여기서 추가 리팩토링 금지(리스크 격리).

---

## Codex 위임 지시 (요약)

> **먼저 `-C /Users/young/Downloads/personal_project/hwp_demo` 로 Codex 실행**(writable root, 아니면 쓰기 무음 실패). 위 설계대로 `scripts/hwpx/{__init__,namespaces,paragraphs}.py`를 만들고 build_hwpx.py에서 해당 정의를 import로 대체하라. **순수 이동 — 로직/동작 변경 금지, 테스트 파일 수정 금지.** `./.venv/bin/python -m pytest scripts/tests/ -q`가 **39 passed 무변경**으로 유지되는지 확인하고 커밋하지 마라(미커밋 유지). 완료 후 `git status --short`, 변경 요약, 실제 pytest 요약을 보고하라.
