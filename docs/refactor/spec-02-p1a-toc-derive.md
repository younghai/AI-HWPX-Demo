# SPEC-P1a — toc를 sections에서 파생 (왕복 제거)

> **작성:** Claude (Fable 5, 감사·설계) · **구현:** Codex GPT-5.5 xhigh
> **작성일:** 2026-07-10 · 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) Phase 1, [appendix/D](appendix/D-data-model.md) §3·§7-rec3
> **커밋 규약:** Codex는 구현 + 테스트만, **커밋 금지**. Claude 감사 후 커밋(`Co-Authored-By: Codex GPT-5.5`).
> **Codex 실행 주의:** 타깃 repo가 세션 cwd 밖이므로 Codex를 `-C /Users/young/Downloads/personal_project/hwp_demo`로 실행(writable root).

---

## 배경

`toc`(목차 = 섹션 헤딩 순서열)가 **7회 재파생 + join/split 왕복 2회**를 겪는다(appendix D §3):

```
client  toc = sections.map(s.heading)          (useDraft.js:202)
        formData.append('toc', toc.join('\n'))  (useDraft.js:205)
server  rawToc.split('\n') → toc[]              (hwpxBuilder.js:105-108)
        '--toc', toc.join('\n')                 (hwpxBuilder.js:167)
python  normalize_toc(args.toc) → split 재차     (build_hwpx.py:104,790)
```

`sections[].heading`이 이미 모든 헤딩을 순서대로 들고 있는데 배열을 파괴·재건한다. 더 나쁜 건 **toc와 sections가 독립 파생**돼 어긋날 수 있다는 점(R6/BUG-1의 근원 — `sections_body.get(toc[i])`가 문자열 불일치 시 빈 섹션).

**이번 범위:** 왕복을 **server+python에서 제거**하고 toc를 **sections 단일 출처에서 1회 파생**. client의 `draft.toc` 상태·FormData append 제거는 진행 중인 client 트랙에 위임(무해하게 무시됨). **검증 통일(생성/편집/export 동일 규칙)은 스키마가 정의되는 [SPEC-P1b]로 이관**(빈 body 섹션 허용 여부 결정이 스키마와 얽힘).

---

## 대상 파일

- `scripts/build_hwpx.py` — `run()` toc 파생 로직.
- `server/services/hwpxBuilder.js` — `--toc` 인자 + rawToc split/join 제거.
- `server/routes/export.js` — `rawToc` 읽기 제거.
- `scripts/tests/test_pipeline.py` (또는 `test_mapper_gaps.py`) — 파생 검증 테스트 추가.
- `server/test/units.test.js` — `--toc` 관련 단언 있으면 갱신(없으면 무변경).

---

## 변경 설계

### 1. python: sections에서 toc 파생 (핵심)

`run()`(`build_hwpx.py:785-795`)의 toc 산정을 교체:

```python
sections_body, diagrams = load_sections_body(args.sections_json)
doc_fields = load_doc_fields(args.doc_fields)

if sections_body:
    # sections 가 있으면 toc 는 sections 헤딩 순서에서 파생(단일 출처).
    # sections_body 는 NFC 정규화된 삽입순 dict → keys() 가 곧 toc.
    # 이로써 toc[i] 와 본문 lookup 키가 구조적으로 항상 일치(R6/BUG-1 divergence 제거).
    toc = list(sections_body.keys())
else:
    # sections 없음(템플릿 전용/CLI): 기존 --toc 폴백 유지.
    toc = [unicodedata.normalize('NFC', item) for item in normalize_toc(args.toc, args.template)]
```

- `parse_args`의 `--toc`는 **유지**(no-sections 폴백 + 기존 CLI/테스트 호환). sections 있으면 무시.
- `normalize_toc`·`title`·`source_document` NFC 처리는 기존대로.
- **주의:** `load_sections_body`의 dict comprehension은 헤딩 중복 시 collapse된다(기존 동작 — 본문 lookup도 이미 heading-keyed라 동일). 즉 파생 toc는 **기존 바인딩과 정확히 일치**하며 이 변경이 중복-헤딩 동작을 악화시키지 않는다(진짜 해결은 Section.id 도입하는 P1b).

### 2. server: 왕복 제거

- `hwpxBuilder.js`: `rawToc` 분해(`:105-108`)와 `args`의 `'--toc', toc.join('\n')`(`:167`) **삭제**. `buildHwpx` 파라미터에서 `rawToc` 제거.
- `export.js`: `rawToc: String(req.body?.toc || '').trim()`(`:48`) **삭제**(더는 buildHwpx가 받지 않음).
- python이 sections에서 파생하므로 server는 toc를 넘길 필요가 없다. 템플릿 전용(no-sections) 경로는 python이 `default_toc`로 폴백 — 실제 UI에서 sections 없이 빌드하는 경로는 없음.
- client의 `formData.append('toc', …)`는 **이번 범위에서 손대지 않음**(server가 무시). client 트랙에서 `draft.toc` 상태와 함께 제거.

---

## 수용 기준

1. **파생 우선:** `--sections-json`이 주어지면 출력 헤딩은 **sections 헤딩에서** 나온다. `--toc`에 다른 값을 줘도 **무시**되고 sections 헤딩이 사용된다.
2. **무-toc 빌드:** `--sections-json`만 주고 `--toc` 없이 빌드해도 정상(헤딩 = sections).
3. **폴백 보존:** sections 없이 `--toc`만 준 CLI 빌드는 기존대로 동작(결정성 테스트 포함).
4. **server 왕복 제거:** hwpxBuilder가 python에 `--toc`를 넘기지 않는다(코드/테스트로 확인).
5. **회귀 무변경:** 기존 pytest 전부 GREEN(BUG-1 회귀 3종 포함 — 이들은 `--toc`==sections라 파생값 동일). server 유닛/통합 테스트 GREEN.
6. **BUG-1 강화 확인:** toc가 sections에서 파생되므로, `--toc`를 sections보다 길게/짧게 줘도 실제 섹션 수는 sections가 결정(BUG-1 오버플로 경로는 여전히 `len(sections_template_slots) < len(파생 toc)`로 작동).

---

## 테스트 조건 (Codex 추가)

먼저 기존 전체 GREEN 확인(`-C hwp_demo` 하에 `./.venv/bin/python -m pytest scripts/tests/ -q`).

- **T1 파생 우선:** `--sections-json`(헤딩 `유래A/유래B/유래C`, 각 고유 body 마커) + `--toc "무시X\n무시Y\n무시Z"` 로 빌드 → 출력 `_heading_texts[:3] == ["유래A","유래B","유래C"]`, `"무시X"` 등 미등장.
- **T2 무-toc:** 위와 동일하되 `--toc` 미전달 → 헤딩 = sections. (`test_mapper_gaps._build_hwpx`에 toc 생략 옵션 추가 또는 별도 커맨드 구성.)
- **T3 폴백:** `--toc "개요"` + `--sections-json` 미전달 → 헤딩/미리보기에 "개요"(기존 `test_doc_date_is_deterministic` 류 유지).
- **server:** hwpxBuilder가 구성하는 args에 `--toc`가 없음을 단언(유닛) 또는 export 통합 테스트 GREEN 유지.

---

## 위험

- **낮음.** 파생 toc는 기존 전송 toc와 값이 동일(둘 다 `sections.map(heading)`)하므로 동작 보존. 유일 행동 변화는 "`--toc`와 sections가 어긋난 비정상 입력"에서 sections를 신뢰 — 이는 **개선**(R6 divergence 제거).
- 중복 헤딩 엣지는 기존과 동일하게 남음(P1b Section.id에서 해결).
- server에서 `rawToc` 제거 시 export 라우트/유닛 테스트가 이를 참조하지 않는지 확인.

---

## Codex 위임 지시 (요약)

> **먼저 `cd /Users/young/Downloads/personal_project/hwp_demo` (Codex writable root를 이 repo로).** 위 설계대로 toc를 sections에서 파생하도록 python `run()`을 바꾸고, server(hwpxBuilder.js·export.js)의 `--toc`/rawToc 왕복을 제거하라. 파생 검증 테스트를 추가하고 **`./.venv/bin/python -m pytest scripts/tests/` + server 테스트(`pnpm -C server test` 또는 관행) GREEN 확인까지 하되 커밋하지 마라**(미커밋 유지). 기존 테스트를 깨지 말 것. 완료 후 변경 파일 목록 + 실제 pytest/server 테스트 요약을 보고하라.
