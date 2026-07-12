import { tryExtractJson, validateDraftPayload, ValidationError } from '../../shared/validate.js'
import { buildToc, deriveTitle, labelForDocType, getDocTypeMeta } from '../../shared/docTypes.js'
import { AI_PROVIDERS, resolveModel } from '../lib/providers-config.js'
import { createHttpError } from '../lib/errors.js'
import { callAnthropic, callOpenAICompatible } from './ai.js'
import { mockDraftJson, mockSectionBody } from './mockAi.js'
import { getValidAccessToken } from '../lib/oauthTokens.js'
import { record } from '../lib/metrics.js'
import { buildDocFieldLines, buildPrompt } from './promptBuilder.js'
import { estimateUsage } from '../lib/usage.js'

// Prefer a valid OAuth access token (refreshed if needed) for OAuth-connected
// providers, falling back to the static API key. See review BE-05.
// userKey scopes the token lookup to the requesting user (SEC-1) — 'local' in
// the no-login localhost mode.
async function resolveApiKey(provider, providerKey, userKey = 'local') {
  const oauthToken = await getValidAccessToken(provider, userKey, providerKey)
  return oauthToken || process.env[provider.envKey] || ''
}

function callProviderOnce({ providerKey, provider, apiKey, model }, prompt, { systemPrompt, jsonMode } = {}) {
  return providerKey === 'anthropic'
    ? callAnthropic(provider, apiKey, prompt, { systemPrompt, model })
    : callOpenAICompatible(provider, apiKey, prompt, { systemPrompt, model, jsonMode })
}

// 요청 입력 강제변환의 단일 지점 (SPEC-P3-e). 세 생성 함수가 각자 흩뿌리던
// String(input.x || …).trim() 묶음의 단일 출처 — 필드를 추가하면 여기 한 곳만
// 고친다. 시맨틱은 기존과 동일: falsy 일 때만 fallback, 이후 trim.
function normalizeDraftInput(input) {
  const s = (value, fallback = '') => String(value || fallback).trim()
  return {
    sourceText: s(input.sourceText),
    docType: s(input.docType, 'report'),
    companyName: s(input.companyName, '회사명'),
    goal: s(input.goal),
    notes: s(input.notes),
    fileName: s(input.fileName, 'uploaded-document'),
    targetTitle: s(input.targetTitle),
    heading: s(input.heading),
    title: s(input.title, '문서'),
    providerKey: s(input.aiProvider, 'anthropic'),
    otherHeadings: Array.isArray(input.otherHeadings) ? input.otherHeadings.filter(Boolean) : []
  }
}

export async function buildDraftWithAI(input, { onProgress, userKey = 'local' } = {}) {
  // Optional progress sink for the streaming route (review B2). No-op for the
  // plain JSON endpoint. Kept best-effort — a throwing sink never breaks generation.
  const emit = (evt) => { try { onProgress?.(evt) } catch { /* ignore */ } }
  const { sourceText, docType, companyName, goal, notes, fileName, targetTitle, providerKey } = normalizeDraftInput(input)

  const effectiveText = sourceText
    || `제목: ${targetTitle || '문서 초안'}\n목표: ${goal || '일반 문서 작성'}\n메모: ${notes || '없음'}\n회사: ${companyName}`

  const provider = AI_PROVIDERS[providerKey]
  if (!provider) {
    throw createHttpError(`지원하지 않는 AI 프로바이더입니다: ${providerKey}`, 400)
  }

  // SEC-2: 요청 body 의 키는 받지 않는다 — 키는 env(설정 UI가 .env 에 저장) 또는
  // 사용자별 OAuth 스토어에서만 온다. client 는 원래 생성 요청에 키를 싣지 않는다.
  const apiKey = await resolveApiKey(provider, providerKey, userKey)
  if (!provider.demo && !apiKey) {
    throw createHttpError(`API 키가 설정되지 않았습니다. 환경변수 ${provider.envKey}를 설정하거나 UI에서 직접 입력해 주세요.`, 401)
  }

  const hasUploadedTemplate = Boolean(sourceText)
  const fallbackToc = buildToc(docType)
  const title = targetTitle || deriveTitle(fileName, docType)
  const docLabel = labelForDocType(docType)
  const templateBodySlots = Number(input.templateBodySlots) || null

  const meta = getDocTypeMeta(docType)
  const docFields = (input.docFields && typeof input.docFields === 'object') ? input.docFields : {}
  const docFieldLines = buildDocFieldLines(meta, docFields)

  const prompt = buildPrompt({
    effectiveText, hasUploadedTemplate, title, docLabel, companyName, goal, notes, fallbackToc, templateBodySlots,
    guidance: meta.guidance, docFieldLines
  })
  emit({ phase: 'prompt' })

  const chosenModel = resolveModel(provider, input.model)
  const providerCall = { providerKey, provider, apiKey, model: chosenModel.id }
  const callOnce = () => {
    if (provider.demo) {
      // No network — synthesize a placeholder draft that still flows through the
      // same tryExtractJson + validateDraftPayload pipeline below.
      return Promise.resolve({
        text: JSON.stringify(mockDraftJson({ toc: fallbackToc, docLabel, companyName, goal })),
        usage: null
      })
    }
    return callProviderOnce(providerCall, prompt, { jsonMode: provider.jsonMode })
  }

  let realUsage = null

  const startedAt = Date.now()
  let attempts = 0
  let validated = null
  let lastError = null
  let lastResponseText = ''
  for (let attempt = 0; attempt < 2; attempt += 1) {
    attempts += 1
    emit({ phase: 'calling', attempt: attempts, provider: provider.label, model: chosenModel.id })
    let text
    try {
      const res = await callOnce()
      text = res.text
      lastResponseText = text
      if (res.usage) realUsage = res.usage
    } catch (err) {
      lastError = createHttpError(`AI 호출 실패: ${err.message}`, 502)
      continue
    }
    emit({ phase: 'parsing', attempt: attempts })
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
    record('ai_draft', { ok: false, ms: Date.now() - startedAt })
    throw lastError || createHttpError('AI 응답을 처리할 수 없습니다.', 502)
  }
  const elapsedMs = Date.now() - startedAt
  record('ai_draft', { ok: true, ms: elapsedMs })
  const usageEstimate = estimateUsage({
    promptText: prompt,
    outputText: lastResponseText,
    usageFromApi: realUsage,
    priceIn: chosenModel.priceIn || 0,
    priceOut: chosenModel.priceOut || 0,
    elapsedMs
  })

  const usage = {
    elapsedMs: usageEstimate.elapsedMs,
    attempts,
    estInputTokens: usageEstimate.estInputTokens,
    estOutputTokens: usageEstimate.estOutputTokens,
    tokensMeasured: usageEstimate.tokensMeasured,
    estCostUsd: usageEstimate.estCostUsd,
    provider: provider.label,
    model: chosenModel.id
  }

  return {
    usage,
    title,
    summary: validated.summary || `${companyName} 기준으로 ${docLabel} 초안을 생성했습니다.`,
    toc: validated.sections.map((s) => s.heading),
    sections: validated.sections,
    diagrams: validated.diagrams,
    engine: provider.label
  }
}

// Regenerate the body of a single section (review PO-01, section-level regenerate).
// Returns plain body text — no JSON wrapper — so the OpenAI-compatible path is
// given a plain-text system prompt instead of the JSON-forcing default.
export async function regenerateSectionWithAI(input, { userKey = 'local' } = {}) {
  const { heading, title, docType, companyName, goal, notes, sourceText, otherHeadings, providerKey } = normalizeDraftInput(input)

  if (!heading) throw createHttpError('섹션 제목이 비어 있습니다.', 422)

  const provider = AI_PROVIDERS[providerKey]
  if (!provider) throw createHttpError(`지원하지 않는 AI 프로바이더입니다: ${providerKey}`, 400)

  const apiKey = await resolveApiKey(provider, providerKey, userKey)
  if (!provider.demo && !apiKey) throw createHttpError(`API 키가 설정되지 않았습니다. 환경변수 ${provider.envKey}를 설정하거나 UI에서 입력해 주세요.`, 401)

  const docLabel = labelForDocType(docType)
  if (provider.demo) {
    return { body: mockSectionBody({ heading, companyName, docLabel }) }
  }

  const systemPrompt = '당신은 한국어 공식 문서 작성 전문가입니다. 요청한 섹션의 본문 텍스트만 출력하세요.'
  const prompt = `"${title}" ${docLabel}의 "${heading}" 섹션 본문만 새로 작성하세요.
${sourceText ? `\n원문 참고:\n---\n${sourceText.slice(0, 4000)}\n---\n` : ''}
회사명: ${companyName}
${goal ? `작성 목표: ${goal}` : ''}
${notes ? `추가 참고: ${notes}` : ''}
${otherHeadings.length ? `다른 섹션(내용 중복 금지): ${otherHeadings.join(', ')}` : ''}

규칙:
- "${heading}" 섹션에 해당하는 본문만 3~5개의 완결된 문장으로 작성.
- 제목·머리말·목록기호·JSON 없이 본문 문장만 출력.
- 다른 섹션과 내용 중복 금지. 마침표로 끝나는 완결 문장만.`

  const chosenModel = resolveModel(provider, input.model)
  const res = await callProviderOnce({ providerKey, provider, apiKey, model: chosenModel.id }, prompt, { systemPrompt })

  const body = String(res.text || '').trim()
  if (!body) throw createHttpError('AI가 빈 응답을 반환했습니다.', 502)
  return { body }
}

// (A-rec 7, spec-12) 실험 스파이크 buildDraftParallel 은 제거됐다 — 자기 문서로
// "strictly lower quality", client 발신 경로 없음(실사용 0), usage shape 상이.
// 복원이 필요하면 git 이력의 C2 spike 를 참조.
