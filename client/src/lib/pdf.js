import { svgToJpegDataUrl, svgNaturalSize } from './rasterize.js'

// Client-side PDF export of the rendered HWPX pages (review C3).
//
// rhwp already renders each page to SVG in the browser; we rasterize those to
// JPEG and assemble a multi-page PDF. This is a "preview-based" PDF — the HWPX
// remains the authoritative format — but it's instantly shareable with people
// who don't have Hancom Office. jsPDF is lazy-imported so it never weighs down
// the initial bundle.

const PRINT_SCALE = 2       // rasterize at 2x for crisp text
const JPEG_QUALITY = 0.9    // JPEG keeps the PDF ~10x smaller than PNG for text pages

/**
 * Build and download a PDF from an array of page SVG strings.
 * @param {string[]} svgs  one SVG string per page (full document, not just preview)
 * @param {string} fileName  suggested download name (…​.hwpx → …​.pdf)
 * @returns {Promise<boolean>} true on success
 */
export async function buildPdfFromSvgs(svgs, fileName) {
  if (!Array.isArray(svgs) || svgs.length === 0) return false
  const { jsPDF } = await import('jspdf')

  let pdf = null
  for (const svg of svgs) {
    const { width, height } = svgNaturalSize(svg)
    const dataUrl = await svgToJpegDataUrl(svg, Math.round(width * PRINT_SCALE), Math.round(height * PRINT_SCALE), JPEG_QUALITY)
    const orientation = width >= height ? 'landscape' : 'portrait'
    if (!pdf) {
      pdf = new jsPDF({ orientation, unit: 'px', format: [width, height], hotfixes: ['px_scaling'] })
    } else {
      pdf.addPage([width, height], orientation)
    }
    pdf.addImage(dataUrl, 'JPEG', 0, 0, width, height)
  }

  const base = String(fileName || 'document').replace(/\.hwpx$/i, '')
  pdf.save(`${base}.pdf`)
  return true
}
