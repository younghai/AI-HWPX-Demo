# HC-2 설계 노트 — 원문 표 보존 컨텍스트 (HWP/HWPX → Markdown 추출)

> 상태: **구현 완료 + 검증 통과 (2026-07-11).** 서버 `4a804c4` · 클라 `83f8e91`.
> Codex 사용량 한도로 감사자가 본 스펙 그대로 직접 구현(사전 확정 스펙 = 작성자/검토자 분리 보완).
> 검증: 서버 52·클라 43·pytest 45 그린, 호스트 graceful `{ok:false}`+415 실측,
> 컨테이너 실문서 E2E(HTML table 보존, 200KB 절단 플래그) 통과. 작성: 감사자(계획·감사 lane), 2026-07-11.
> 전제: HC-1 인프라 재사용 — `vendor/hwpconverter`(Apache-2.0, 9af63ea 고정), `isHwpConverterAvailable()`,
> P3-b의 `runProcess({ exactEnv, maxOutputBytes })`, #5의 `capabilities.hwpConvert` 노출.

## 문제

AI 초안 생성의 원문 컨텍스트(`sourceText`)는 클라이언트 rhwp가 렌더한 SVG에서 뽑은 **flat 텍스트**다
(`extractTextFromSvg`) — 표 구조가 소실되어 "일시/참석자/예산표" 같은 핵심 데이터가 행·열 관계 없이
줄글로 뭉개진다. AI가 원문 표를 읽고 쓰지 못하는 것이 초안 품질의 상한을 만든다.

hwpConverter의 HWP/HWPX→MD 추출은 `CtrlTable`을 **GFM 표**(중첩·병합은 HTML table)로 보존한다
(HWP 5.0 §5.4 인라인 컨트롤 처리 포함, PoC 감사에서 코드 확인).

## 설계 (점진적 향상, 회귀 0 원칙)

```
[client] parseFile(file)
   ├─ (기존) rhwp WASM 파싱 → 미리보기 + flat extractedText  ← 항상 수행(불변)
   └─ (신규) capabilities.hwpConvert && 크기 OK
        → POST /api/extract (multipart) → { ok, markdown }
        → 성공 시 sourceInsight.extractedText = markdown (실패/미가용 시 기존 flat 유지)
```

- **서버** `POST /api/extract` (신규 라우트, `requireSession`):
  - multer 단일 파일(shared/limits의 `MAX_UPLOAD_BYTES`), `assertValidUpload` + `decodeOriginalName` (R8).
  - 업로드를 workDir 임시파일로 → `runProcess(JAVA_BIN, [-Xmx512m, -cp, jar:lib/*, HwpConverterCli, in, out.md], { exactEnv: 화이트리스트, timeoutMs: 60000 })` — hwpConvert.js의 기존 spawn 규약 재사용(가능하면 `convertHwpToHwpx`와 나란한 `extractMarkdown()` 함수로 hwpConvert.js에 추가).
  - out.md 읽기 상한 **200KB**(초과분 절단 + `truncated: true`) — 프롬프트 상한은 기존 draft 경로가 처리.
  - 실패·미가용 시 `{ ok: false, reason }` (HTTP 200, graceful — 클라 폴백 조건 단순화). finally에서 임시파일 unlink.
- **클라** `useRhwp.parseFile`: rhwp 파싱 완료 후, 주입받은 `capabilities.hwpConvert`가 true고
  파일이 한도 내면 `/api/extract` 호출(비동기, 파싱 상태 문구는 기존 유지 — 완료 시 조용히 교체).
  병합 규칙은 순수 함수 `pickSourceText(flatText, mdResult)`로 분리(lib) — md가 `ok && markdown.trim()`이면
  md, 아니면 flat. **미리보기 렌더에는 영향 0** (extractedText만 교체).
- **표시**: sourceInsight에 `extractEngine: 'rhwp' | 'hwpconverter'`를 남겨 ControlPanel 파싱 상태 문구에
  "표 구조 보존 추출 적용" 한 줄 추가(엔진이 hwpconverter일 때만).

## 하지 않는 것 (스코프 밖)
- MD→프롬프트 요약/청킹 고도화(기존 excerpt 로직 유지), HWPX 업로드의 templateBodySlots 추정 변경 없음,
  extract 결과 캐싱(파일당 1회 호출이라 불요).

## 테스트 / 수용 기준
1. 서버 유닛: extract 라우트 — 변환기 미가용 시 `{ok:false}` graceful(파일 검증은 통과해야), 잘못된 업로드 415/400 기존 규약, 200KB 절단 플래그.
2. 클라 유닛: `pickSourceText` 3분기(md 채택 / md 실패 폴백 / capability off 미호출은 훅 레벨 — 호출 안 함을 fetch 스파이로).
3. 기존 전 스위트 그린 + `pnpm -C client build`.
4. (감사자) 호스트: capability=false 경로 — 업로드→생성이 기존과 동일 동작. 컨테이너(java 있음): 실제 HWP 업로드
   → /api/extract가 GFM 표 포함 md 반환 → 생성 프롬프트에 표 텍스트 유입 확인(mock 프로바이더 draft의 sourceExcerpt로 검증).

## 리스크
- JVM cold start ~1s/호출: 파싱 단계 1회라 수용. 폭주 방지는 기존 rate limit + 크기 한도.
- MD 품질은 문서별 상이 — 최악에도 flat 폴백과 동급(교체는 non-empty일 때만).
