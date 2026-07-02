/**
 * polaris_dvc CLI 래퍼.
 *
 * polaris_dvc (https://github.com/PolarisOffice/polaris_dvc) 는
 * Rust 로 포팅된 한컴 DVC 호환 HWPX 검증기다. 설치되어 있으면 우리 native
 * validator 에 추가로 "규칙 적합성(JID 1000–7999)" + "스키마(JID 13000+)"
 * 축을 얻을 수 있다.
 *
 * 설치: `bash v3/scripts/setup-polaris-dvc.sh`
 *
 * 바이너리가 없거나 spec 파일이 없으면 graceful degrade (빈 결과 반환).
 */
import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { runProcess } from '../lib/utils.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v3Root = path.resolve(__dirname, '..', '..')
const defaultBin = path.join(v3Root, 'tools', 'bin', 'polaris-dvc')
const fallbackSpec = path.join(v3Root, 'tools', 'polaris-dvc-spec.json')
const specsDir = path.join(v3Root, 'specs')

const binPath = process.env.POLARIS_DVC_CLI || defaultBin

// docType → spec 파일 해상도. docType 별 override 환경변수도 지원.
async function resolveSpecPath(docType) {
  const envKey = docType ? `VALIDATION_SPEC_${docType.toUpperCase()}` : null
  const envOverride = envKey ? process.env[envKey] : null
  const candidates = []
  if (envOverride) candidates.push(envOverride)
  if (docType) candidates.push(path.join(specsDir, `${docType}.json`))
  candidates.push(path.join(specsDir, 'base.json'))
  candidates.push(fallbackSpec)
  for (const p of candidates) {
    try {
      await fs.access(p, fs.constants.R_OK)
      return p
    } catch {
      // try next
    }
  }
  return fallbackSpec
}

let binaryCache = null

async function checkBinary() {
  if (binaryCache !== null) return binaryCache
  try {
    await fs.access(binPath, fs.constants.X_OK)
    binaryCache = { ok: true }
  } catch (err) {
    binaryCache = { ok: false, reason: err.code || err.message }
  }
  return binaryCache
}

function axisFromJid(jid) {
  const n = Number(jid) || 0
  if (n >= 13000 && n < 14000) return 'schema'
  if (n >= 12000 && n < 13000) return 'container'
  if (n >= 11000 && n < 12000) return 'structure'
  if (n >= 1000 && n < 8000) return 'rule'
  return 'other'
}

function normalizePolarisViolation(raw) {
  const code = raw.ErrorCode
  return {
    axis: axisFromJid(code),
    code: `J${code}`,
    severity: 'error',
    message: raw.ErrorString || '',
    location: raw.FileLabel
      ? `${raw.FileLabel}${raw.ByteOffset ? `@${raw.ByteOffset}` : ''}`
      : null,
    extras: {
      pageNo: raw.PageNo || undefined,
      lineNo: raw.LineNo || undefined,
      isInTable: raw.IsInTable || undefined
    }
  }
}

/**
 * polaris_dvc 가 사용 가능하면 실행해 JID 기반 결과를 우리 Violation 구조로 정규화해 반환.
 * 사용 불가 시 { engine: 'polaris-dvc', available: false, reason }.
 *
 * 옵션:
 *   docType: 'report' | 'proposal' | 'minutes' | 'gonmun' | 'base' | undefined
 *            v3/specs/<docType>.json 을 사용. 없으면 base.json → fallback spec 순으로 해결.
 *   enableSchema: true 면 --enable-schema 추가 (기본 off — 한컴 정식 포맷만 체크)
 *   dvcStrict: 기본 true — 한컴 DVC 와 바이트 호환 모드
 */
export async function validateWithPolarisDvc(hwpxPath, { docType, enableSchema = false, dvcStrict = true } = {}) {
  const avail = await checkBinary()
  if (!avail.ok) {
    return {
      engine: 'polaris-dvc',
      available: false,
      reason: avail.reason,
      violations: []
    }
  }
  const specPath = await resolveSpecPath(docType)
  const args = ['-t', specPath, '-a', '--format=json']
  if (dvcStrict) args.push('--dvc-strict')
  if (enableSchema) args.push('--enable-schema')
  args.push(hwpxPath)

  const result = await runProcess(binPath, args, v3Root, { timeoutMs: 15000 })
  const raw = result.stdout.trim()
  let rawViolations = []
  try {
    const parsed = JSON.parse(raw || '[]')
    rawViolations = Array.isArray(parsed) ? parsed : []
  } catch {
    return {
      engine: 'polaris-dvc',
      available: true,
      violations: [],
      note: `polaris-dvc 응답 JSON 파싱 실패: ${raw.slice(0, 120)}`
    }
  }
  const violations = rawViolations.map(normalizePolarisViolation)
  return {
    engine: 'polaris-dvc',
    available: true,
    binPath,
    specPath,
    dvcStrict,
    enableSchema,
    violations,
    violationCount: violations.length
  }
}
