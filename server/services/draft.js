import { tryExtractJson, validateDraftPayload, ValidationError } from '../../shared/validate.js'
import { buildToc, deriveTitle, labelForDocType, getDocTypeMeta } from '../../shared/docTypes.js'
import { AI_PROVIDERS, resolveModel } from '../lib/providers-config.js'
import { createHttpError } from '../lib/errors.js'
import { callAnthropic, callOpenAICompatible } from './ai.js'
import { mockDraftJson, mockSectionBody } from './mockAi.js'
import { getValidAccessToken } from '../lib/oauthTokens.js'
import { record } from '../lib/metrics.js'
import { buildDocFieldLines, buildPrompt } from './promptBuilder.js'

// Prefer a valid OAuth access token (refreshed if needed) for OAuth-connected
// providers, falling back to the static API key. See review BE-05.
async function resolveApiKey(provider, providerKey) {
  const oauthToken = await getValidAccessToken(provider, providerKey)
  return oauthToken || process.env[provider.envKey] || ''
}

export async function buildDraftWithAI(input, { onProgress } = {}) {
  // Optional progress sink for the streaming route (review B2). No-op for the
  // plain JSON endpoint. Kept best-effort — a throwing sink never breaks generation.
  const emit = (evt) => { try { onProgress?.(evt) } catch { /* ignore */ } }
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

  const apiKey = (await resolveApiKey(provider, providerKey)) || clientKey
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
  const callOnce = () => {
    if (provider.demo) {
      // No network — synthesize a placeholder draft that still flows through the
      // same tryExtractJson + validateDraftPayload pipeline below.
      return Promise.resolve({
        text: JSON.stringify(mockDraftJson({ toc: fallbackToc, docLabel, companyName, goal })),
        usage: null
      })
    }
    return providerKey === 'anthropic'
      ? callAnthropic(provider, apiKey, prompt, { model: chosenModel.id })
      : callOpenAICompatible(provider, apiKey, prompt, { model: chosenModel.id, jsonMode: provider.jsonMode })
  }

  let realUsage = null

  // Per-model pricing (USD / 1M tokens) resolved from providers-config.
  const pricing = { in: chosenModel.priceIn || 0, out: chosenModel.priceOut || 0 }
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
  // Prefer provider-reported token counts; fall back to a char-based estimate
  // (한국어 ≈ 1.5, 영어 ≈ 4 chars/token → conservative /3) when absent (review PO-05).
  const estInputTokens = realUsage?.inputTokens ?? Math.ceil(prompt.length / 3)
  const estOutputTokens = realUsage?.outputTokens ?? Math.ceil(lastResponseText.length / 3)
  const tokensMeasured = Boolean(realUsage)
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
    tokensMeasured,
    estCostUsd: Number(estCostUsd.toFixed(4)),
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
    sourceExcerpt: lines.slice(0, 8),
    engine: provider.label
  }
}

// Regenerate the body of a single section (review PO-01, section-level regenerate).
// Returns plain body text — no JSON wrapper — so the OpenAI-compatible path is
// given a plain-text system prompt instead of the JSON-forcing default.
export async function regenerateSectionWithAI(input) {
  const heading = String(input.heading || '').trim()
  const title = String(input.title || '문서').trim()
  const docType = String(input.docType || 'report').trim()
  const companyName = String(input.companyName || '회사명').trim()
  const goal = String(input.goal || '').trim()
  const notes = String(input.notes || '').trim()
  const sourceText = String(input.sourceText || '').trim()
  const otherHeadings = Array.isArray(input.otherHeadings) ? input.otherHeadings.filter(Boolean) : []
  const providerKey = String(input.aiProvider || 'anthropic').trim()

  if (!heading) throw createHttpError('섹션 제목이 비어 있습니다.', 422)

  const provider = AI_PROVIDERS[providerKey]
  if (!provider) throw createHttpError(`지원하지 않는 AI 프로바이더입니다: ${providerKey}`, 400)

  const apiKey = await resolveApiKey(provider, providerKey)
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
  const res = providerKey === 'anthropic'
    ? await callAnthropic(provider, apiKey, prompt, { systemPrompt, model: chosenModel.id })
    : await callOpenAICompatible(provider, apiKey, prompt, { systemPrompt, model: chosenModel.id })

  const body = String(res.text || '').trim()
  if (!body) throw createHttpError('AI가 빈 응답을 반환했습니다.', 502)
  return { body }
}

// ── C2 spike: parallel per-section generation ────────────────────────────────
// EXPERIMENTAL / opt-in (input.parallel). Generates each section body
// concurrently (reusing the tested regenerateSectionWithAI, with de-dup context)
// instead of one monolithic call. Trade-off: total latency ≈ slowest section
// (not the sum), and natural per-section progress — BUT strictly lower quality
// than the monolithic path (no AI-written summary, no diagrams, and sections are
// generated independently so global coherence/de-dup is weaker). Whether the
// latency win justifies the quality cost can only be judged with real API keys;
// keep this off by default until measured. See B2 for the SSE progress channel.
export async function buildDraftParallel(input, { onProgress } = {}) {
  const emit = (evt) => { try { onProgress?.(evt) } catch { /* ignore */ } }
  const docType = String(input.docType || 'report').trim()
  const companyName = String(input.companyName || '회사명').trim()
  const fileName = String(input.fileName || 'uploaded-document').trim()
  const targetTitle = String(input.targetTitle || '').trim()
  const providerKey = String(input.aiProvider || 'anthropic').trim()

  const provider = AI_PROVIDERS[providerKey]
  if (!provider) throw createHttpError(`지원하지 않는 AI 프로바이더입니다: ${providerKey}`, 400)
  const apiKey = (await resolveApiKey(provider, providerKey)) || String(input.aiApiKey || '').trim()
  if (!provider.demo && !apiKey) {
    throw createHttpError(`API 키가 설정되지 않았습니다. 환경변수 ${provider.envKey}를 설정하거나 UI에서 직접 입력해 주세요.`, 401)
  }

  const toc = buildToc(docType)
  const title = targetTitle || deriveTitle(fileName, docType)
  const docLabel = labelForDocType(docType)
  const chosenModel = resolveModel(provider, input.model)

  emit({ phase: 'planning', total: toc.length })
  const startedAt = Date.now()

  // Bounded concurrency so N sections don't hammer the provider's rate limit.
  const CONCURRENCY = 3
  const sections = new Array(toc.length)
  let cursor = 0
  let done = 0
  async function worker() {
    while (cursor < toc.length) {
      const i = cursor++
      const heading = toc[i]
      const { body } = await regenerateSectionWithAI({
        aiProvider: providerKey,
        aiApiKey: input.aiApiKey,
        model: input.model,
        heading,
        title,
        docType,
        companyName,
        goal: input.goal,
        notes: input.notes,
        sourceText: input.sourceText,
        otherHeadings: toc.filter((_, j) => j !== i)
      })
      sections[i] = { heading, body }
      done += 1
      emit({ phase: 'section', done, total: toc.length, heading })
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toc.length) }, worker))

  const elapsedMs = Date.now() - startedAt
  record('ai_draft_parallel', { ok: true, ms: elapsedMs })

  return {
    usage: {
      elapsedMs,
      attempts: toc.length,
      provider: provider.label,
      model: chosenModel.id,
      parallel: true
    },
    title,
    summary: `${companyName} 기준으로 ${docLabel} 초안을 ${toc.length}개 섹션 병렬 생성했습니다. (실험적 병렬 모드)`,
    toc,
    sections,
    diagrams: [],
    sourceExcerpt: [],
    engine: `${provider.label} (parallel)`
  }
}
