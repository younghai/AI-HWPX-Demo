# v3 RuleSpec — docType 별 HWPX 검증 규칙

polaris_dvc 의 RuleSpec 포맷을 사용해 docType 별로 문서 품질 기준을 다르게 적용한다.

## 포맷 요약

polaris_dvc 가 받는 최상위 struct:

```json
{
  "charshape": {
    "font": ["바탕", "함초롬바탕"],   // 허용 폰트 whitelist (복수)
    "fontsize": 10,                   // 강제 폰트 크기 (pt 단위)
    "bold": false                     // bold 강제
  },
  "parashape": {
    "linespacingvalue": 160           // 강제 줄 간격 (160 = 160%)
  }
}
```

한 필드라도 값이 지정되면 해당 필드는 **정확히 일치해야 통과**. 없는 필드는 검사 안 함.

## 제공되는 spec 파일

| 파일 | 용도 | 엄격도 |
| --- | --- | --- |
| `base.json` | 기본값 — 어떤 규칙도 강제 안 함 (구조·컨테이너 축만 활성) | 🟢 관대 |
| `report.json` | 일반 보고서 — 흔한 한국어 업무 폰트 허용 | 🟡 중간 |
| `proposal.json` | 제안서 — 디자인 다양성 허용, 본문만 체크 | 🟢 관대 |
| `minutes.json` | 회의록 — 맑은 고딕 / 바탕 만 허용 | 🟡 중간 |
| `gonmun.json` | 공문서 — 공공 표준 준수 (함초롬바탕 10pt) | 🔴 엄격 |

## 커스터마이징

조직/부서별 커스텀이 필요하면 위 파일을 수정하거나 `custom-<orgname>.json` 을 추가한 뒤
서버 측에서 `VALIDATION_SPEC_<DOCTYPE>=custom-<orgname>.json` 환경변수로 override.

## 주의사항

- **엄격 규칙은 false positive 를 쉽게 만든다**. 템플릿은 대개 제목 = 큰 폰트, 본문 = 작은 폰트로 섞여 있으므로 `fontsize` 를 단일 값으로 강제하면 제목도 위반으로 찍힌다.
- 현재 v3 기본값은 **font whitelist 정도만** 강제 — 프로덕션 도입 전 실제 문서 샘플로 false positive 확인 필수.
- spec 변경 후 `bash v4/testdata/run-golden.sh` 로 회귀 확인.
