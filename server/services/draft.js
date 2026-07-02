import { tryExtractJson, validateDraftPayload, ValidationError } from '../../shared/validate.js'
import { buildToc, deriveTitle, labelForDocType } from '../../shared/docTypes.js'
import { AI_PROVIDERS } from '../lib/providers-config.js'
import { createHttpError } from '../lib/errors.js'
import { callAnthropic, callOpenAICompatible } from './ai.js'

function buildPrompt({ effectiveText, hasUploadedTemplate, title, docLabel, companyName, goal, notes, fallbackToc, templateBodySlots }) {
  // v3 P1: 템플릿 본문 슬롯 수가 감지되면 해당 섹션 수만큼 필수 반환
  const sectionCountGuide = templateBodySlots && templateBodySlots > 0
    ? `업로드한 템플릿에는 약 ${templateBodySlots}개의 본문 단락 슬롯이 있습니다. 이를 고려해 섹션을 충분히(최소 5개 이상) 구성하되, 각 섹션의 body 에는 3~5개의 완결된 문장(마침표로 구분)을 포함하세요.`
    : `섹션은 5개 이상 구성하고, 각 섹션 body 에는 3~5개의 완결된 문장(마침표로 구분)을 포함하세요.`

  const sharedDiagramSpec = `${sectionCountGuide}

다이어그램 data 형식:
- flowchart: data = ["단계1", "단계2", "단계3"] (최대 5개)
- timeline: data = [{"label": "이벤트명", "date": "2024.01"}, ...] (최대 6개)
- comparison: data = [{"label": "항목", "a": "현재값", "b": "개선값", "header_a": "현재", "header_b": "개선"}, ...] (최대 5개)
문서 내용에 가장 적합한 타입의 다이어그램을 1~2개 생성하세요. 불필요하면 빈 배열 []로 두세요.

⚠️ 중요 규칙:
- 모든 섹션의 body 는 반드시 내용을 채워라. 빈 body 금지.
- 섹션 간 본문을 중복·재사용하지 마라. 각 섹션은 독립적인 내용이어야 한다.
- 마침표로 끝나는 완결 문장만 포함. 미완성 조각 금지.

응답은 반드시 아래 JSON 형식으로만 출력하세요. 다른 텍스트는 포함하지 마세요:
{
  "summary": "문서 전체 요약 (1~2문장)",
  "sections": [
    {"heading": "섹션 제목", "body": "해당 섹션 본문 내용 (3~5문장, 마침표 구분)"}
  ],
  "diagrams": [
    {"_diagram": true, "afterSection": "해당 섹션 제목", "type": "flowchart|timeline|comparison", "title": "다이어그램 제목", "data": []}
  ]
}`

  if (hasUploadedTemplate) {
    return `당신은 한국어 공식 문서 작성 전문가입니다.

아래는 사용자가 업로드한 원본 템플릿 문서에서 추출한 텍스트입니다:
---
${effectiveText}
---

위 원본 템플릿의 구조(제목, 목차, 섹션 순서, 문체)를 최대한 유지하면서, "${title}" 제목의 새로운 ${docLabel}를 작성해 주세요.
원본 템플릿에 있는 섹션 제목과 구조를 그대로 따르되, 본문 내용만 새로 작성하세요.

회사명: ${companyName}
${goal ? `작성 목표: ${goal}` : ''}
${notes ? `추가 참고: ${notes}` : ''}

${sharedDiagramSpec}`
  }

  return `당신은 한국어 공식 문서 작성 전문가입니다.

아래 조건에 맞는 "${title}" 제목의 ${docLabel}를 작성해 주세요.

회사명: ${companyName}
${goal ? `작성 목표: ${goal}` : ''}
${notes ? `추가 참고: ${notes}` : ''}

아래 목차 구조에 맞춰 각 섹션의 본문을 작성하세요:
${fallbackToc.map((item, i) => `${i + 1}. ${item}`).join('\n')}

${sharedDiagramSpec}`
}

export async function buildDraftWithAI(input) {
  const sourceText = String(input.sourceText || '').trim()
  const docType = String(input.docType || 'report').trim()
  const companyName = String(input.companyName || '회사명').trim()
  const goal = String(input.goal || '').trim()
  const notes = String(input.notes || '').trim()
  const fileName = String(input.fileName || 'uploaded-document').trim()
  const targetTitle = String(input.targetTitle || '').trim()
  const providerKey = String(input.aiProvider || 'anthropic').trim()
  const clientKey = String(input.aiApiKey || '').trim()

  const effectiveText = sourceText
    || `제목: ${targetTitle || '문서 초안'}\n목표: ${goal || '일반 문서 작성'}\n메모: ${notes || '없음'}\n회사: ${companyName}`

  const provider = AI_PROVIDERS[providerKey]
  if (!provider) {
    throw createHttpError(`지원하지 않는 AI 프로바이더입니다: ${providerKey}`, 400)
  }

  const apiKey = process.env[provider.envKey] || clientKey
  if (!apiKey) {
    throw createHttpError(`API 키가 설정되지 않았습니다. 환경변수 ${provider.envKey}를 설정하거나 UI에서 직접 입력해 주세요.`, 401)
  }

  const hasUploadedTemplate = Boolean(sourceText)
  const fallbackToc = buildToc(docType)
  const title = targetTitle || deriveTitle(fileName, docType)
  const docLabel = labelForDocType(docType)
  const templateBodySlots = Number(input.templateBodySlots) || null

  const prompt = buildPrompt({
    effectiveText, hasUploadedTemplate, title, docLabel, companyName, goal, notes, fallbackToc, templateBodySlots
  })

  const callOnce = () => providerKey === 'anthropic'
    ? callAnthropic(provider, apiKey, prompt)
    : callOpenAICompatible(provider, apiKey, prompt)

  // v4: AI 비용/시간 측정용 (provider별 대략적 단가 — 정확한 토큰은 응답에 따라 다름)
  // 단위: USD per 1M tokens (input, output) — 2025-10 시점 공개 단가 근사
  const PRICING_USD_PER_M = {
    anthropic: { in: 15, out: 75 },        // Claude Opus 4.7 (대략)
    openai:    { in: 2.5, out: 10 },       // gpt-4o (대략)
    kimi:      { in: 0.5, out: 2 },        // moonshot-v1 (대략)
    xai:       { in: 0.3, out: 0.5 }       // grok-3-mini (대략)
  }
  const startedAt = Date.now()
  let attempts = 0
  let validated = null
  let lastError = null
  let lastResponseText = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    attempts += 1
    let text
    try {
      text = await callOnce()
      lastResponseText = text
    } catch (err) {
      lastError = createHttpError(`AI 호출 실패: ${err.message}`, 502)
      continue
    }
    const parsed = tryExtractJson(text)
    if (!parsed) {
      lastError = createHttpError('AI 응답에서 JSON을 추출할 수 없습니다.', 502)
      continue
    }
    try {
      validated = validateDraftPayload(parsed)
      break
    } catch (err) {
      if (err instanceof ValidationError) {
        lastError = createHttpError(`AI 응답 형식 오류: ${err.message}`, 502)
        continue
      }
      throw err
    }
  }
  if (!validated) {
    throw lastError || createHttpError('AI 응답을 처리할 수 없습니다.', 502)
  }
  const elapsedMs = Date.now() - startedAt
  // 토큰 추정: 영어 4 chars/token, 한국어 1.5 chars/token. 보수적으로 prompt/answer 길이 / 3.
  const estInputTokens = Math.ceil(prompt.length / 3)
  const estOutputTokens = Math.ceil(lastResponseText.length / 3)
  const pricing = PRICING_USD_PER_M[providerKey] || { in: 0, out: 0 }
  const estCostUsd = (estInputTokens * pricing.in + estOutputTokens * pricing.out) / 1_000_000

  const lines = effectiveText
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((value, index, array) => array.indexOf(value) === index)

  const usage = {
    elapsedMs,
    attempts,
    estInputTokens,
    estOutputTokens,
    estCostUsd: Number(estCostUsd.toFixed(4)),
    provider: provider.label
  }

  return {
    usage,
    title,
    summary: validated.summary || `${companyName} 기준으로 ${docLabel} 초안을 생성했습니다.`,
    toc: validated.sections.map((s) => s.heading),
    sections: validated.sections,
    diagrams: validated.diagrams,
    sourceExcerpt: lines.slice(0, 8),
    engine: provider.label
  }
}
