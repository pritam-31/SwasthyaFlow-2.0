import { deflateSync } from 'node:zlib'
import { PDFParse } from 'pdf-parse'

/**
 * Dependency-free fixture builders for the report tests (P0-1).
 *
 *  - `renderTextPng(lines)` draws crisp bitmap text (5x7 glyphs, scaled) into a
 *    PNG so tesseract can OCR it without any canvas dependency.
 *  - `buildTextPdf(lines)` creates a native-text-layer PDF for the pdf-parse
 *    path, so parsing/redaction tests never depend on OCR.
 *  - `buildImagePdf(lines)` embeds the rendered text as a FlateDecode RGB image
 *    with no text layer — a genuine "scanned PDF" for the screenshot→OCR path.
 */

/* ------------------------------------------------------------------ */
/*  5x7 bitmap font (rows top→bottom, '1' = ink)                       */
/* ------------------------------------------------------------------ */

const GLYPHS: Record<string, string[]> = {
  '0': ['01110', '10001', '10011', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11111', '00010', '00100', '00010', '00001', '10001', '01110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['00110', '01000', '10000', '11110', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00010', '01100'],
  A: ['01110', '10001', '10001', '10001', '11111', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11100', '10010', '10001', '10001', '10001', '10010', '11100'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['11111', '00100', '00100', '00100', '00100', '00100', '11111'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '/': ['00001', '00001', '00010', '00100', '01000', '10000', '10000'],
  '%': ['11001', '11001', '00010', '00100', '01000', '10011', '10011'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  ',': ['00000', '00000', '00000', '00000', '00000', '01100', '00100'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
}

export const GLYPH_W = 5
export const GLYPH_H = 7

function toRgba(lines: string[], scale: number): { width: number; height: number; data: Buffer } {
  const spacer = 1
  const cellW = (GLYPH_W + spacer) * scale
  const cellH = (GLYPH_H + spacer) * scale
  const margin = 16
  const textW = Math.max(1, ...lines.map((l) => l.length)) * cellW - spacer * scale
  const width = textW + margin * 2
  const height = lines.length * cellH + margin * 2 + 6
  const data = Buffer.alloc(width * height * 4, 255)

  lines.forEach((line, li) => {
    const baseX = margin + Math.floor((textW - line.length * cellW) / 2)
    const baseY = margin + 3 + li * cellH
    for (let ci = 0; ci < line.length; ci++) {
      const glyph = GLYPHS[line[ci].toUpperCase()] ?? GLYPHS[' ']
      for (let r = 0; r < GLYPH_H; r++) {
        for (let c = 0; c < GLYPH_W; c++) {
          if (glyph[r][c] !== '1') continue
          for (let sy = 0; sy < scale; sy++) {
            for (let sx = 0; sx < scale; sx++) {
              const x = baseX + ci * cellW + c * scale + sx
              const y = baseY + r * scale + sy
              data[(y * width + x) * 4] = 0
              data[(y * width + x) * 4 + 1] = 0
              data[(y * width + x) * 4 + 2] = 0
              data[(y * width + x) * 4 + 3] = 255
            }
          }
        }
      }
    }
  })
  return { width, height, data }
}

/* ------------------------------------------------------------------ */
/*  Minimal PNG writer                                                 */
/* ------------------------------------------------------------------ */

function crcTable(): Uint32Array {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
}
const CRC = crcTable()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(8 + data.length + 4)
  out.writeUInt32BE(data.length, 0)
  out.write(type, 4, 'ascii')
  data.copy(out, 8)
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
  return out
}

function rawPng(width: number, height: number, rgba: Buffer): Buffer {
  const stride = 1 + width * 4
  const raw = Buffer.alloc(height * stride)
  for (let y = 0; y < height; y++) {
    raw[y * stride] = 0 // filter: none
    rgba.copy(raw, y * stride + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

/** Renders text as a crisp black-on-white PNG (scale 6 → ~30x42 px glyphs). */
export function renderTextPng(lines: string[], scale = 6): Buffer {
  const { width, height, data } = toRgba(lines, scale)
  return rawPng(width, height, data)
}

export interface RenderedImage {
  width: number
  height: number
  rgba: Buffer
}

/** Raw RGB(A) pixels of the rendered lines — for PDF embedding. */
export function renderTextPixels(lines: string[], scale = 6): RenderedImage {
  const { width, height, data } = toRgba(lines, scale)
  return { width, height, rgba: data }
}

/* ------------------------------------------------------------------ */
/*  Minimal PDF writer                                                 */
/* ------------------------------------------------------------------ */

function buildPdf(objects: string[]): Buffer {
  const offsets: number[] = []
  let pdf = '%PDF-1.4\n'
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) pdf += `${String(off).padStart(10, '0')} 00000 n \n`
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

function contentObject(raw: string): string {
  return `<< /Length ${Buffer.byteLength(raw, 'latin1')} >>\nstream\n${raw}endstream`
}

/** A one-page PDF with a real Helvetica text layer (native-text extraction). */
export function buildTextPdf(lines: string[]): Buffer {
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  const paging = lines.map((line) => `(${escape(line)}) Tj\n0 -16 Td`)
  const content = `BT /F1 12 Tf 40 740 Td\n${paging.join('\n')}\nET\n`

  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    contentObject(content),
  ])
}

/** A scanned-style PDF: rendered text as a FlateDecode RGB image, no text layer. */
export function buildImagePdf(lines: string[], scale = 6): Buffer {
  const { width, height, rgba } = renderTextPixels(lines, scale)
  const rgb = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      rgb[(y * width + x) * 3] = rgba[(y * width + x) * 4]
      rgb[(y * width + x) * 3 + 1] = rgba[(y * width + x) * 4 + 1]
      rgb[(y * width + x) * 3 + 2] = rgba[(y * width + x) * 4 + 2]
    }
  }
  const imageStream = deflateSync(rgb)
  const fit = Math.min((612 / width) * 0.9, (792 / height) * 0.9)
  const dw = Math.round(width * fit)
  const dh = Math.round(height * fit)
  const x = Math.round((612 - dw) / 2)
  const y = Math.round((792 - dh) / 2)
  const placement = `q ${dw} 0 0 ${dh} ${x} ${y} cm /Im0 Do Q\n`

  return buildPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im0 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode /Length ${imageStream.length} >>\nstream\n${imageStream.toString('latin1')}endstream`,
    contentObject(placement),
  ])
}

/**
 * Renders a PDF page to a high-resolution PNG via pdf-parse's renderer
 * (Helvetica glyphs — exactly what tesseract reads best). Used to exercise
 * the real OCR pipeline deterministically without a canvas dependency.
 */
export async function renderPdfToPng(pdf: Buffer, pageNumber = 1, scale = 3): Promise<Buffer> {
  const parser = new PDFParse({ data: new Uint8Array(pdf) })
  try {
    const shots = await parser.getScreenshot({
      imageBuffer: true,
      imageDataUrl: false,
      scale,
      partial: [pageNumber],
    })
    const page = shots.pages.find((p) => p.pageNumber === pageNumber) ?? shots.pages[0]
    return Buffer.from(page.data)
  } finally {
    await parser.destroy()
  }
}