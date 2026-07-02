# ADR 0003: AI 섹션 ↔ HWPX 1:1 매핑 (pad / dup 금지)

**Status**: Accepted — 2026-04-20

## Decision

`scripts/build_hwpx.py` `apply_smart_replacements` 는 다음 invariant 를 지킨다:

1. **AI가 N 섹션을 주면 HWPX 에도 N 섹션만 AI 내용으로 채움.** 템플릿에 더 많은 섹션이 있어도 pad 하지 않음.
2. **AI body 문장 수 = 해당 섹션에 채워지는 body 단락 수.** body 슬롯이 남으면 빈 상태로 비움. 마지막 문장 중복 금지.
3. **AI가 body 를 안 준 섹션은 빈 상태.** `_body_sentence` 같은 generic placeholder 로 채우지 않음 (preview 에 안 보이는 내용이 download 에 생기면 invariant 깨짐).

## Rationale

이전 버전에서 발생한 버그:
- `normalize_toc` 가 toc 를 5개로 강제 pad → HWPX 에 `추가 섹션 4` / `추가 섹션 5` 가짜 헤딩 생성
- AI 가 body 에 1문장만 줬는데 템플릿 body 단락이 3개 → 같은 문장 **3회 반복** 출력
- AI 가 특정 섹션을 빼먹은 경우 → `_body_sentence` placeholder 가 대신 들어감

→ 사용자: "preview 는 깨끗한데 download 는 전혀 다른 내용!"

## Invariant 수학

```
len(HWPX_filled_sections) == len(AI_sections)
∀ section i:
  len(HWPX_body_paragraphs_filled_in_section_i) == len(AI_sentences_in_section_i)
  단, AI_sentences_in_section_i == [] 이면 body 단락은 빈 상태 유지
```

## Consequences

- AI 가 5 섹션을 기대하는 템플릿에 3 섹션만 주면 → HWPX 하단 2 섹션은 템플릿 원본 (placeholder) 유지 or 사용자가 직접 수정
- 이것이 "less invasive" 설계 — 템플릿 나머지 부분은 건드리지 않음
- 향후 개선 가능: AI 에게 N 섹션 강제 프롬프트 / 혹은 남은 템플릿 섹션 자동 삭제

## 관련 코드

- `scripts/build_hwpx.py` `normalize_toc` — pad 로직 완전 제거
- `scripts/build_hwpx.py` `apply_smart_replacements`:
  - `for i, sec in enumerate(sections): if i >= len(toc): break`
  - `for body_p, sentence in zip(body_ps, sentences)` (zip 은 짧은 쪽으로 자름)
  - `for extra_p in body_ps[len(sentences):]: _normalize_paragraph(extra_p, "")`

## 회귀 테스트

`tools/smoke-test.sh` 단계 6:
- AI가 3 섹션, 각각 1~3 문장 제공
- 결과 HWPX 에서 각 마커가 **정확히 1회씩** 등장 (중복 0, 누락 0)
- `추가 섹션` / `원본 서식에 맞게` 같은 pad/placeholder 텍스트 0회
