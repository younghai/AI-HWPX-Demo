// HC-2: 서버 MD 추출(표 구조 보존) 채택 로직 — 순수 함수 + 얇은 fetch 래퍼.
// 설계: docs/design-hc2-md-context.md. 미리보기 렌더에는 관여하지 않고
// sourceInsight.extractedText(AI 프롬프트 원문 컨텍스트)만 다룬다.

// 원문 컨텍스트의 단일 예산 (PO-02). useRhwp 의 flat 추출과 서버 MD 채택이
// 같은 상한을 공유한다 — 프롬프트 쪽에는 별도 상한이 없으므로 이것이 정본.
export const MAX_SOURCE_TEXT_CHARS = 12000

// 서버 MD 결과가 쓸 만하면 예산 내로 잘라 채택, 아니면 flat 유지.
export function pickSourceText(flatText, mdResult) {
  const markdown = mdResult?.ok ? String(mdResult.markdown || '').trim() : ''
  if (!markdown) return { text: flatText, engine: 'rhwp' }
  return { text: markdown.slice(0, MAX_SOURCE_TEXT_CHARS), engine: 'hwpconverter' }
}

// POST /api/extract — 네트워크/파싱 실패는 null (호출측은 flat 폴백). 절대 throw 금지.
export async function fetchServerExtract(file) {
  try {
    const body = new FormData()
    body.append('file', file, file.name)
    const res = await fetch('/api/extract', { method: 'POST', body, credentials: 'include' })
    if (!res.ok) return null
    return await res.json()
  } catch {
    return null
  }
}
