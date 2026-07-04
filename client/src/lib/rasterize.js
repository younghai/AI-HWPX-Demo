// Rasterize a diagram SVG string to a PNG Blob in the browser (review B1).
//
// The SVG shown in the preview is turned into the exact PNG that gets embedded
// in the downloaded HWPX — so "preview == download" holds by construction, and
// the server no longer needs the native cairosvg/libcairo to render diagrams.

const DIAGRAM_W = 605
const DIAGRAM_H = 302

// renderDiagramSvg emits `<svg xmlns=... viewBox=...>` with no intrinsic size.
// An <img> needs explicit width/height to rasterize at full resolution, so
// inject them onto the root tag.
function withExplicitSize(svg, w, h) {
  return svg.replace(/<svg\b/, `<svg width="${w}" height="${h}"`)
}

/**
 * @param {string} svgString  output of renderDiagramSvg()
 * @returns {Promise<Blob>} PNG blob at 605x302
 */
export function svgToPngBlob(svgString, w = DIAGRAM_W, h = DIAGRAM_H) {
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
        // White backing so transparent SVG areas don't turn black in the HWPX.
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, w, h)
        ctx.drawImage(img, 0, 0, w, h)
        URL.revokeObjectURL(url)
        canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))), 'image/png')
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
