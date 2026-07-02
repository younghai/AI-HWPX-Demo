import path from 'path'
import { fileURLToPath } from 'url'
import { runProcess } from '../lib/utils.js'
import { validateWithPolarisDvc } from './polarisValidator.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const v3Root = path.resolve(__dirname, '..', '..')
const validatorScript = path.join(v3Root, 'scripts', 'validators', 'validate.py')

async function runNativeValidator(hwpxPath) {
  try {
    const result = await runProcess('python3', [validatorScript, hwpxPath, '--format=json'], v3Root, { timeoutMs: 15000 })
    const raw = result.stdout.trim()
    if (!raw) return { violations: [], note: '검증기가 출력을 내지 않았습니다.' }
    try {
      const parsed = JSON.parse(raw)
      return {
        violations: (parsed.violations || []).map((v) => ({ ...v, source: 'v3-native' }))
      }
    } catch {
      return { violations: [], note: `native 검증기 응답 파싱 실패: ${raw.slice(0, 120)}` }
    }
  } catch (err) {
    return { violations: [], note: `native 검증기 실행 실패: ${err.message}` }
  }
}

/**
 * HWPX 검증 — native + (옵션) polaris_dvc 를 병행 실행해 결과를 합친다.
 *
 * 반환:
 *   {
 *     ok: boolean,
 *     errorCount, warningCount,
 *     violations: [{ axis, code, severity, message, location, source }],
 *     engines: [{ name, available, violationCount, note? }]
 *   }
 */
export async function validateHwpx(hwpxPath, { docType } = {}) {
  const [native, polaris] = await Promise.all([
    runNativeValidator(hwpxPath),
    validateWithPolarisDvc(hwpxPath, { docType }).catch((err) => ({
      engine: 'polaris-dvc',
      available: false,
      violations: [],
      note: `polaris-dvc 실행 예외: ${err.message}`
    }))
  ])

  const polarisViolations = (polaris.violations || []).map((v) => ({ ...v, source: 'polaris-dvc' }))
  const violations = [...native.violations, ...polarisViolations]
  const errorCount = violations.filter((v) => v.severity === 'error').length
  const warningCount = violations.filter((v) => v.severity === 'warning').length

  return {
    ok: errorCount === 0,
    errorCount,
    warningCount,
    violations,
    engines: [
      { name: 'v3-native', available: true, violationCount: native.violations.length, note: native.note },
      {
        name: 'polaris-dvc',
        available: !!polaris.available,
        violationCount: polarisViolations.length,
        note: polaris.reason || polaris.note,
        dvcStrict: polaris.dvcStrict,
        enableSchema: polaris.enableSchema,
        specPath: polaris.specPath
      }
    ]
  }
}
