# HC-3 설계 노트 — .hwp 다운로드 옵션 (HWPX → HWP 역변환)

> 상태: **설계 확정 + PoC 실증 (2026-07-12). 구현 Codex 디스패치.** 작성: 감사자(계획·감사 lane).
> 전제: HC-1/2 인프라 재사용 — `vendor/hwpconverter`(Apache-2.0, 9af63ea 고정),
> `runConverterCli()`(hwpConvert.js), `capabilities.hwpConvert`, `/generated` 서빙 규약.

## 문제

생성 결과물은 HWPX 단일 포맷이다. 구버전 한/글(2010 등)·HWP만 받는 제출 시스템 사용자는
결과물을 직접 변환해야 한다. 변환기(JRE+jar)가 이미 컨테이너에 내장돼 있으므로
서버 측 역변환(HWPX→HWP) 다운로드 옵션을 제공한다.

## PoC 실증 (2026-07-12, ai-hwp:hc2 컨테이너)

- CLI는 `.hwpx → .hwp` 를 1급 경로로 지원 — `convertHwpxToHwp` (HwpConverter.java 978-980행 라우팅 주석 + 구현 확인).
- 오늘 생성된 데모 HWPX(36KB): 역변환 → 유효 CFB/OLE2 시그니처(`d0 cf 11 e0`) HWP 9.7KB,
  왕복(HWP→HWPX) 후 **본문 텍스트 노드 22/22(100%) 보존**.
- 실물 정부 문서(825KB, BinData 이미지 8개): hwp→hwpx→hwp 사이클 정상, 674KB 유효 CFB(이미지 벌크 유지).
- `--network none`에서 `InetAddress.getLocalHost` 스택트레이스가 로그에 찍히나 **변환은 정상 완료**(비치명).

## 설계

```
[client] 빌드 완료(exportState.url 존재) + capabilities.hwpConvert
   └─ "HWP로 받기" 버튼 → POST /api/convert-hwp { fileName }
        → { ok, downloadUrl: /generated/<basename>.hwp, fileName }
        → 기존 triggerDownload 재사용
```

- **서버** `POST /api/convert-hwp` (신규 라우트, `requireSession`, JSON body `{ fileName }`):
  - 검증: `path.basename(fileName) === fileName`(트래버설 차단), `.hwpx`로 끝, `generatedDirectory`에 실재.
  - 변환기 미가용/변환 실패 → `{ ok: false, reason }` HTTP 200 graceful (HC-2 계약 미러).
  - 서비스: `convertHwpxToHwp(inputPath, outDir)`를 hwpConvert.js에 추가 — 기존
    `runConverterCli(input, `${uuid}.hwp`, label)` 재사용 후 `<basename>.hwp`로 rename.
  - **캐시**: `<basename>.hwp`가 이미 있으면 재변환 없이 즉시 응답(재클릭 멱등).
  - downloadUrl은 history.js와 동일 규약: `/generated/${encodeURIComponent(name)}` —
    신규 서빙 표면 없음(기존 `express.static` + `requireSession`).
  - `COST_LIMITED_PATHS`에 `/api/convert-hwp` 추가(JVM 스폰 비용 경로).
  - 산출물 수명: `startGeneratedCleanup`이 확장자 무관 TTL·용량 기준 → `.hwp` 자동 편승(추가 코드 불요).
- **클라**: PDF 다운로드 패턴 미러 —
  - `lib/convertHwp.js`: `requestHwpConversion(fileName)` fetch 헬퍼(실패/비ok → null, throw 금지).
  - `useDocumentFlow`: `handleDownloadHwp` + `hwpBusy` 상태(pdfBusy 패턴), 성공 시 `triggerDownload`,
    실패 토스트.
  - `ControlPanel`: `hwpConvertAvailable && exportState.url`일 때만 "HWP로 받기" 버튼 노출.
- **불변식 보호(R-미션)**: "미리보기 == 다운로드 바이트 동일"은 **HWPX에 대해 유지**.
  HWP는 변환 파생본임을 UI 문구로 명시 — 토스트: "구버전 호환용 HWP 변환본입니다.
  미리보기와 동일한 원본은 HWPX입니다." (파생본을 원본인 것처럼 표시 금지)

## 하지 않는 것 (스코프 밖)
- 배치 변환, HWP 자체 미리보기, `--dist`/DRM 옵션, ODT 경로, 변환 결과 레이아웃 보정.

## 테스트 / 수용 기준
1. 서버 유닛: `convertHwpxToHwp` 미가용 → null(JAVA_BIN 스텁, extract.test.js 패턴);
   라우트 — 트래버설/비-.hwpx/부재 파일 4xx, 미가용 `{ok:false}` graceful, 캐시 히트 시 즉시 응답.
2. 클라 유닛: `requestHwpConversion` 3분기(성공/비ok/네트워크 예외).
3. 기존 전 스위트 green + `pnpm -C client build` + lint 0.
4. (감사자) 컨테이너 E2E: 실제 빌드 산출물 → `/api/convert-hwp` → CFB 시그니처 + 왕복 마커 보존.

## 리스크
- JVM cold start 1~3s/호출: 비용 경로 rate limit + 캐시로 흡수.
- 변환 손실 가능성(복잡 서식): 파생본 라벨링으로 기대치 관리 — 원본은 항상 HWPX.
- 호스트(변환기 없음): capability로 버튼 자체가 미노출 → UX 회귀 0.
