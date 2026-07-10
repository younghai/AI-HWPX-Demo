// Rasterize a diagram SVG string to a PNG Blob in the browser (review B1).
//
// The SVG shown in the preview is turned into the exact PNG that gets embedded
// in the downloaded HWPX — so "preview == download" holds by construction, and
// the server no longer needs the native cairosvg/libcairo to render diagrams.

import { DIAGRAM_W, DIAGRAM_H } from './diagrams.js'

// An <img> needs explicit width/height on the root <svg> to rasterize at full
// resolution. rhwp page SVGs already carry width/height, so we must STRIP the
// existing ones before adding — a duplicate attribute makes the SVG unparseable
// and the <img> silently fails to load (this broke PDF export, review C3).
// Diagram SVGs (viewBox only) are unaffected: the strips are no-ops.
function withExplicitSize(svg, w, h) {
  return svg.replace(/<svg\b[^>]*>/i, (tag) =>
    tag
      .replace(/\swidth="[^"]*"/i, '')
      .replace(/\sheight="[^"]*"/i, '')
      .replace(/<svg\b/i, `<svg width="${w}" height="${h}"`)
  )
}

/**
 * Read an SVG's natural pixel size from its width/height attrs, falling back to
 * the viewBox, then to A4 @96dpi. Used for PDF page sizing (review C3).
 * @returns {{ width: number, height: number }}
 */
export function svgNaturalSize(svgString) {
  const wm = svgString.match(/\bwidth="([\d.]+)/)
  const hm = svgString.match(/\bheight="([\d.]+)/)
  let w = wm ? parseFloat(wm[1]) : 0
  let h = hm ? parseFloat(hm[1]) : 0
  if (!w || !h) {
    const vb = svgString.match(/viewBox="[\d.]+\s+[\d.]+\s+([\d.]+)\s+([\d.]+)"/)
    if (vb) { w = parseFloat(vb[1]); h = parseFloat(vb[2]) }
  }
  if (!w || !h) { w = 794; h = 1123 } // A4 @96dpi
  return { width: w, height: h }
}

// Load an SVG string into a canvas at w×h on a white backing. Shared by the
// PNG-blob (diagram) and JPEG-dataURL (PDF) paths.
function svgToCanvas(svgString, w, h) {
  return new Promise((resolve, reject) => {
    const svg = withExplicitSize(svgString, w, h)
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }))
    const img = new Image()
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        ctx.fillStyle = '#ffffff' // white backing so transparent areas aren't black
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        resolve(canvas)
      } catch (err) {
        URL.revokeObjectURL(url)
        reject(err)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('SVG failed to load into an image for rasterization'))
    }
    img.src = url
  })
}

/**
 * @param {string} svgString  output of renderDiagramSvg()
 * @returns {Promise<Blob>} PNG blob at 605x302 (diagram embedding, review B1)
 */
export async function svgToPngBlob(svgString, w = DIAGRAM_W, h = DIAGRAM_H) {
  const canvas = await svgToCanvas(svgString, w, h)
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), 'image/png')
  })
}

/**
 * Rasterize an SVG to a JPEG data URL (review C3). JPEG keeps document pages an
 * order of magnitude smaller than PNG in the assembled PDF, at negligible visual
 * cost for mostly-white text pages.
 * @returns {Promise<string>} data:image/jpeg;base64,…
 */
export async function svgToJpegDataUrl(svgString, w, h, quality = 0.9) {
  const canvas = await svgToCanvas(svgString, w, h)
  return canvas.toDataURL('image/jpeg', quality)
}
