import sharp from 'sharp'
import type { PiiRegion } from '../types'

/**
 * Paints black boxes over PII regions (P0-2).
 *
 * The stored JPEG is ALWAYS this redacted output. Normalised 0..1 boxes are
 * mapped to the actual image pixels and painted opaque black (plus a small
 * safety margin) so nothing readable survives. A photo with no detected PII
 * passes through byte-identical to the ingester's output.
 *
 * LOW-LEVEL PAINTER (P0-7): the unified image pipeline calls this; it is not
 * routed back through `unifiedAnonymizer` (would recurse / cycle).
 */

/** Extra pixels on every side of a box so glyphs at the box edge are covered. */
const PADDING_PX = 2

export async function redactImage(
  base: Buffer,
  width: number,
  height: number,
  regions: PiiRegion[],
): Promise<Buffer> {
  const rects = regions
    .map((region) => toPixelRect(region.bbox, width, height))
    .filter(Boolean) as Array<{ x: number; y: number; width: number; height: number }>

  if (rects.length === 0) return base

  // Vector overlay: lightweight regardless of image size, and the composite
  // render is a single sharp pass (no huge intermediate raw buffers).
  const rectSvg = rects.map((r) => `<rect x="${r.x}" y="${r.y}" width="${r.width}" height="${r.height}"/>`).join('')
  const svg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">` +
      `<rect width="${width}" height="${height}" fill="none"/>${rectSvg}</svg>`,
  )

  return sharp(base).composite([{ input: svg, top: 0, left: 0 }]).jpeg().toBuffer()
}

function toPixelRect(
  box: { x: number; y: number; width: number; height: number },
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } | null {
  const x0 = Math.round(clamp(box.x, 0, 1) * width) - PADDING_PX
  const y0 = Math.round(clamp(box.y, 0, 1) * height) - PADDING_PX
  const x1 = Math.round(clamp(box.x + box.width, 0, 1) * width) + PADDING_PX
  const y1 = Math.round(clamp(box.y + box.height, 0, 1) * height) + PADDING_PX

  const cx0 = Math.max(0, x0)
  const cy0 = Math.max(0, y0)
  const cx1 = Math.min(width, x1)
  const cy1 = Math.min(height, y1)
  if (cx1 <= cx0 || cy1 <= cy0) return null
  return { x: cx0, y: cy0, width: cx1 - cx0, height: cy1 - cy0 }
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}