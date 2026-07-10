export function usageMessage(usage) {
  if (!usage) return ''
  const prefix = usage.tokensMeasured ? '' : '추정 '
  const cost = usage.estCostUsd > 0 ? ` · ${prefix}비용 $${usage.estCostUsd.toFixed(4)}` : ''
  return `AI 응답 ${(usage.elapsedMs / 1000).toFixed(1)}초${cost}`
}

export function providerListErrorMessage() {
  return 'AI provider 목록을 불러오지 못했습니다.'
}

export function diagramReportFeedback(dr) {
  if (!dr || dr.requestedCount <= 0) return null
  if (dr.embeddedCount === dr.requestedCount) {
    return {
      kind: 'info',
      text: `다이어그램 ${dr.embeddedCount}/${dr.requestedCount}개가 문서에 반영되었습니다.`
    }
  }
  if (dr.embeddedCount === 0) {
    return {
      kind: 'error',
      text: `다이어그램 ${dr.requestedCount}개가 문서에 반영되지 못했습니다. 미리보기를 다시 생성하거나 브라우저를 새로고침해 보세요.`
    }
  }
  return {
    kind: 'error',
    text: `다이어그램 ${dr.embeddedCount}/${dr.requestedCount}개만 반영되었습니다. 일부 다이어그램이 누락됐습니다.`
  }
}

export function validationFeedback(v) {
  if (!v) return null
  if (!v.ok) {
    return {
      kind: 'error',
      text: `HWPX 검증: 에러 ${v.errorCount}건, 경고 ${v.warningCount}건. 우측 검증 패널을 확인하세요.`
    }
  }
  if (v.warningCount > 0) {
    return {
      kind: 'info',
      text: `HWPX 검증: 경고 ${v.warningCount}건. 큰 문제는 없습니다.`
    }
  }
  return {
    kind: 'success',
    text: 'HWPX 검증 통과! 다운로드할 수 있습니다.'
  }
}
