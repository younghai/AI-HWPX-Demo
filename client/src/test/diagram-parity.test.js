import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'
import { renderDiagramSvg } from '../lib/diagrams.js'

// Renderer parity guard (review D3). There are TWO diagram renderers — this
// client one (diagrams.js, authoritative since B1) and the Python cairosvg
// fallback (scripts/diagram_templates.py). If they drift (e.g. a font or label
// change lands in only one), the fallback would embed a different diagram than
// the preview. This test renders the same specs through both and asserts the
// text content, fonts, and viewBox match exactly.

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SCRIPTS_DIR = path.resolve(__dirname, '..', '..', '..', 'scripts')

const SPECS = [
  { type: 'flowchart', title: '추진 절차', data: ['기획', '개발 & 검증', '배포'] },
  { type: 'timeline', title: '일정 계획', data: [{ label: '착수', date: '2026.01' }, { label: '완료', date: '2026.06' }] },
  { type: 'comparison', title: '개선 비교', data: [{ label: '속도', a: '느림', b: '빠름', header_a: '현재', header_b: '개선' }] }
]

function summarizeSvg(svg) {
  const texts = [...svg.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)].map((m) => m[1])
  const fonts = [...new Set([...svg.matchAll(/font-family="([^"]+)"/g)].map((m) => m[1]))].sort()
  const viewBox = (svg.match(/viewBox="([^"]+)"/) || [])[1] || ''
  return { texts, fonts, viewBox }
}

function pythonSummary(spec) {
  const script = [
    'import sys, json, re',
    `sys.path.insert(0, ${JSON.stringify(SCRIPTS_DIR)})`,
    'from diagram_templates import render_diagram',
    'spec = json.load(sys.stdin)',
    'svg = render_diagram(spec)',
    "texts = re.findall(r'<text[^>]*>(.*?)</text>', svg)",
    "fonts = sorted(set(re.findall(r'font-family=\"([^\"]+)\"', svg)))",
    "m = re.search(r'viewBox=\"([^\"]+)\"', svg)",
    "print(json.dumps({'texts': texts, 'fonts': fonts, 'viewBox': m.group(1) if m else ''}))"
  ].join('\n')
  const out = execFileSync('python3', ['-c', script], { input: JSON.stringify(spec), encoding: 'utf-8' })
  return JSON.parse(out)
}

describe('diagram renderer parity (client JS ↔ python)', () => {
  for (const spec of SPECS) {
    it(`${spec.type}: text/fonts/viewBox match across both renderers`, () => {
      const js = summarizeSvg(renderDiagramSvg(spec))
      const py = pythonSummary(spec)
      expect(js.texts).toEqual(py.texts)
      expect(js.fonts).toEqual(py.fonts)
      expect(js.viewBox).toEqual(py.viewBox)
    })
  }

  it('both renderers use the Korean font stack (not bare Arial)', () => {
    const { fonts } = summarizeSvg(renderDiagramSvg(SPECS[0]))
    expect(fonts.some((f) => f.includes('Pretendard') || f.includes('Apple SD Gothic') || f.includes('Noto Sans KR'))).toBe(true)
    expect(fonts.some((f) => f === 'Arial, sans-serif')).toBe(false)
  })
})
