# SPEC-P1b(완결) — client Section.id 부여 + afterSectionId 발신

> **작성·구현:** Claude (Fable 5) 직접(승인된 모드) · **작성일:** 2026-07-10
> 상위: [spec-06](spec-06-p1b-schema-server-python.md) — server·python은 준비 완료(dormant). 이 SPEC이 id를 실제로 흐르게 해 P1b를 완결한다.

---

## 배경

server(schema 통과)·python(id exact 배치, index 바인딩)은 이미 id-ready. client만 id를 만들지 않아 dormant. client가 id를 부여하면:
- 다이어그램 배치가 **heading 리네임에 내성**을 가짐(id 해석은 수신 시 1회 — 이후 heading이 바뀌어도 바인딩 유지).
- 섹션 리스트 React key가 index → **안정 id**로 (삽입/이동 시 DOM·포커스 정합).

**핵심 정합 요구:** python이 id로 배치하므로 **미리보기(EditableDraft)의 다이어그램 매칭도 id-우선**이어야 한다. 안 그러면 heading 리네임 시 다운로드에는 다이어그램이 있는데 미리보기에서 사라지는 **preview≠download** 역전이 생긴다(이 프로젝트의 제1불변식 위반).

## 변경 설계

**`client/src/lib/helpers.js`** (순수 함수의 집)
- `newSectionId()` — `crypto.randomUUID()` + 구형 환경 폴백.
- `withSectionIds(draft)` — 순수 정규화: id 없는 섹션에 id 부여(기존 id 보존 — 재호출 안정), `diagrams[].afterSection`(heading)을 **첫 일치 섹션**의 id로 해석해 `afterSectionId` 부여(이미 있으면 유지, 미일치는 그대로 → legacy substring 폴백).
- `buildOptimisticDraft` 섹션에 id 포함(단일 canonical shape).

**`client/src/hooks/useDraft.js`** — id 발급점 배선
- `generateDraft` 성공 시 `setDraft(withSectionIds(nextDraft))` (stream·JSON 폴백 수렴점).
- `recoverDraft` — 구버전 autosave(id-less) 정규화.
- `addSection` — 신규 섹션에 `newSectionId()`.
- 나머지 mutator는 spread 보존이라 무변경. autosave는 id를 저장(재로드 안정) — `regenerating`만 계속 strip.

**`client/src/components/EditableDraft.jsx`**
- 다이어그램 매칭: `d.afterSectionId ? d.afterSectionId === section.id : d.afterSection === section.heading` — python 배치 규칙과 대칭(id 우선, heading 폴백).
- `<li key={index}>` → `key={section.id || index}` (컨트롤드 입력이라 무위험, 이동/삽입 시 의미 정확).

**무변경:** `buildHwpx` POST(이미 sections/diagrams를 통째로 직렬화 — id·afterSectionId 자동 탑승, 서버 schema가 보존·`regenerating`은 서버가 strip), server·python 전부.

## 검증

- 신규 `client/src/test/draft-ids.test.js`: ① id 부여·기존 id 보존(재호출 안정) ② afterSectionId 해석(중복 heading은 첫 일치 — 문서화) ③ 낙관적 draft id ④ `addSection` mint(hook) ⑤ **wire 계약**: `buildHwpx`가 POST하는 FormData의 sections JSON에 id, diagrams JSON에 afterSectionId 포함(fetch mock; rasterize는 jsdom canvas 부재로 mock).
- 전체 client + server + python 스위트 GREEN. python의 `test_diagram_after_section_id_wins_over_legacy_substring`(spec-06)가 이 payload의 소비 측을 이미 증명.

## 위험

- **낮음.** 추가적(additive) 변경 — id-less 경로는 전부 폴백 유지. 유일 동작 변화 = 리네임 후 다이어그램 유지(개선)와 안정 key.
- 중복 heading + 다이어그램: 첫 일치 섹션으로 해석(기존 substring도 첫 일치였음 — 동등, 이제 명시적).
