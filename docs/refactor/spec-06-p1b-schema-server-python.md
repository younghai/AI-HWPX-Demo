# SPEC-P1b(부분) — shared 스키마 + 검증 통일 + python id-준비 (python·server 스코프)

> **작성·구현:** Claude (Fable 5) 직접 — Codex 위임 차단, 사용자 승인(2026-07-10 P2.2에서 확립) · 자가검증: 전체 테스트 + RED→GREEN 신규 테스트 + id-less 입력 byte-diff sanity
> **작성일:** 2026-07-10 · 상위: [00-리팩토링-계획서](00-리팩토링-계획서.md) Phase 1, [appendix/D](appendix/D-data-model.md) §7-rec1,2,4,5
> **스코프 결정(사용자):** client 무접촉(진행 중 client 트랙과 충돌 회피). client id 부여·afterSectionId 발신은 후속.

---

## 배경 · 목표

P1a로 toc가 sections에서 파생되면서 **이름-바인딩의 NFC/리네임 divergence는 구조적으로 제거**됐다. 남은 RC-1 결함:

1. **[실버그] 중복 헤딩 collapse** — `load_sections_body`가 `dict[heading→body]`라 같은 헤딩의 섹션 2개가 **1개로 붕괴**(뒤가 앞을 덮어씀). 사용자가 편집기에서 "개요" 섹션을 2개 만들면 본문 하나가 조용히 소실 + 파생 toc도 1개 → **N→N 불변식 위반**(BUG-1 수정이 못 잡는 잔존 케이스).
2. **검증 계약 3개 상충** — 생성: heading+body 필수(`validate.js:26-33`) / export: 배열 여부만(`sections.js:39`) / python: key 존재만(`io.py`). 계약이 코드 3곳에 흩어져 있고 export가 가장 느슨.
3. **id 부재** — 섹션 정체성이 문자열뿐. 다이어그램 배치는 python **substring**(`after_section in t.text`, INV-4) vs client **exact**(`===`) 불일치.

**이번 스코프 산출:**
- `shared/schema.js` — **단일 정식 스키마**(수제 검증, 의존성 0 — Zod 등 금지: no-framework 원칙). `Section{id?, heading, body}` · `Diagram{_diagram, type, title, afterSection, afterSectionId?, data}`.
- generate·export가 **같은 normalizer** 사용(차이는 `requireBody` 옵션뿐 — export의 빈 body는 "빈 슬롯" 의도라 허용, 규칙이 이제 **명시적**).
- python: **순서 보존 list + index 바인딩**(중복 헤딩 수정), id 수신 시 다이어그램 **exact 배치**(afterSectionId→heading, legacy substring 폴백).

**비-behavior-preserving 변경**이므로 byte-diff는 id-less·유일-heading 입력의 **sanity 체크**로만 사용(그 경로는 값 동일해야 함), 새 동작은 RED→GREEN 테스트로 잠근다.

---

## 대상 파일

| 파일 | 변경 |
|---|---|
| 신규 `shared/schema.js` | `ValidationError`(이관), `normalizeSection(s)`, `normalizeDiagram(s)`, `DIAGRAM_TYPES` |
| `shared/validate.js` | schema.js 소비로 축소. `ValidationError` **re-export**(draft.js `instanceof`·client 테스트 정체성 유지). `tryExtractJson` 잔류 |
| `server/lib/sections.js` | `parseSectionsPayload`가 shared normalizer 사용(`requireBody:false`), diagrams도 동일 normalizer(무효 type 드롭 — 생성 경로와 동일 규칙), 기존 에러 메시지 어휘 유지(테스트 계약: `파싱할 수 없습니다`/`비어 있거나`, 422) |
| `scripts/hwpx/io.py` | `load_sections_body` → **순서 보존 `[{id?, heading, body}]`**(NFC). `(None, [])` 무경로 계약 유지 |
| `scripts/hwpx/sections.py` | `apply_smart_replacements(… section_items: list)` — **index 바인딩**(`items[i]["body"]`), `_insert_sections_after`는 `(heading, body)` pairs 수신 |
| `scripts/hwpx/diagrams.py` | `embed_diagrams(…, section_headings_by_id=None)` — `afterSectionId`→heading **exact 매칭** 우선, legacy `afterSection` substring 폴백 |
| `scripts/build_hwpx.py` `run()` | `toc = [it["heading"] for it in section_items]`, `headings_by_id` 전달 |
| 테스트 | python: NFD 테스트 list-접근으로 갱신 + **중복헤딩 N→N**(RED→GREEN) + **afterSectionId exact 배치**(RED→GREEN, legacy afterSection과 충돌시키는 입력). server: id 통과·heading 필수·빈 body 허용·미지 키 제거·무효 diagram 드롭 |

**무접촉:** `client/src/**` 전체, `server/services/hwpxBuilder.js`(combined 통과 로직 그대로 — id는 자동 통과).

---

## 핵심 설계 결정

1. **빈 body는 export에서 허용**(`requireBody:false`) — 편집기의 "빈 슬롯 비우기"는 정당한 UX. 지금까지 **우연히** 허용되던 것을 **명시 계약**으로. heading은 양 경로 모두 필수(빈 heading 문서는 깨진 산출물 — 이제 422로 표면화).
2. **index 바인딩** — P1a 이후 `toc[i] == items[i].heading`이 구조적 보장이므로 dict lookup 자체가 불필요. list가 중복 헤딩을 자연히 보존.
3. **diagram id 경로는 dormant** — client가 afterSectionId를 아직 안 보내므로 실사용 무변화. python·서버가 먼저 준비되고, client 트랙이 id 부여만 하면 활성화.
4. **server 경유 diagram도 normalizer 통과** — 무효 type이 경계에서 드롭(생성 경로와 동일). worker의 skip-report는 "PNG 확보 실패" 등 실패 사유용으로 유지.

## 수용 기준

1. 같은 heading 2개 섹션 → 출력에 **두 섹션 모두**(각 body 1회, heading 2회). *(구코드 RED)*
2. `afterSectionId`가 legacy `afterSection`과 **다른 섹션**을 가리키면 **id가 승리**(exact 배치). *(구코드 RED)*
3. export: heading 누락 422 · 빈 body 통과 · `id` 통과 · 미지 키 제거 · 무효 diagram type 드롭.
4. generate 경로 동작 불변(client `validate.test.js` 포함 전부 GREEN).
5. id-less·유일-heading 입력의 python CLI 출력은 **byte-identical**(sanity).
6. 최종: pytest 전체 + server vitest + client vitest GREEN.
