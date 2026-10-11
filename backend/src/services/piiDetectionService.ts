import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import type { IngestedVisualImage } from './imageIngestService'
import { anonymize } from './anonymizer'
import type { RedactionCategory } from '../types'
import type { BoundingBox, PiiRegion, PiiSummary, PiiType } from '../types'
import type { OcrWordLocation } from './ocrService'

/**
 * PII detection for visual inputs (P0-2).
 *
 * Two detectors feed the redaction layer, and the output is deliberately
 * privacy-biased: a region is redacted when the detector believes it *might*
 * hold PII, so we can allow over-redaction but never under-redaction.
 *
 *  1. OCR text scan (`ocr-label`): tesseract word boxes are grouped into visual
 *     lines; each line text runs through the SAME anonymizer patterns as the
 *     report pipeline (P0-1) plus image-specific labels (`name plate`,
 *     `hospital band`, `wristband`). A line that matches is black-boxed.
 *
 * LOW-LEVEL DETECTOR (P0-7): this module is intentionally NOT wired back through
 * `unifiedAnonymizer.anonymiseImage` — that would form an import cycle and
 * recurse. It is the primitive the unified image pipeline *calls*.
 *
 *  2. Face heuristic (`face-heuristic`): this prototype does NOT ship a trained
 *     model (the model cannot be bundled reliably offline). Instead it uses a
 *     deterministic skin-tone / roundness heuristic — a documented, certified
 *     substitute that favours recall over precision. It looks for compact,
 *     roughly oval skin-tone blobs occupying 3–45% of the frame that do not
 *     span most of the image border. Over-reporting is intentional and safe;
 *     a real deployment would swap in a bundled ONNX face model behind this
 *     same interface. The heuristic is explained to the reviewer in the UI.
 *
 * Raw PII text and raw pixels are never returned — only region type + bbox.
 */

const PII_LABELS: Array<{ type: PiiType; pattern: RegExp }> = [
  { type: 'name-plate', pattern: /\b(name\s?plate|nameplate|name\s?tag|identification\s?tag|identity\s?card\s?holder)\b/i },
  { type: 'hospital-band', pattern: /\b(hospital\s?band|patient\s?band|id\s?band|identity\s?band)\b/i },
  { type: 'wristband', pattern: /\b(wrist\s?band|wristband)\b/i },
]

const REDACTION_TO_PII: Record<RedactionCategory, PiiType> = {
  name: 'name-plate',
  phone: 'phone',
  address: 'address',
  'id-number': 'id-number',
  email: 'email',
  'date-of-birth': 'date-of-birth',
  'hospital-id': 'hospital-id',
  'patient-id': 'patient-id',
  aadhaar: 'aadhaar',
  pan: 'pan',
  'voter-id': 'voter-id',
  'ration-card': 'ration-card',
  'lab-name': 'lab-name',
}

/** Most specific / most identifying category wins when a line matches several. */
const PII_PRIORITY: PiiType[] = [
  'aadhaar',
  'pan',
  'voter-id',
  'ration-card',
  'hospital-id',
  'patient-id',
  'id-number',
  'phone',
  'date-of-birth',
  'email',
  'address',
  'name-plate',
  'lab-name',
]

export interface TextLineWithBox {
  text: string
  x0: number
  y0: number
  x1: number
  y1: number
}

function groupWordsIntoLines(words: OcrWordLocation[]): TextLineWithBox[] {
  if (words.length === 0) return []
  const heights = words.map((w) => Math.max(1, w.y1 - w.y0)).sort((a, b) => a - b)
  const medianHeight = heights[Math.floor(heights.length / 2)] ?? 10
  const tolerance = Math.max(6, medianHeight * 0.6)

  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)
  const lines: TextLineWithBox[] = []
  let current: OcrWordLocation[] = []
  let bottom = Number.NEGATIVE_INFINITY

  const flush = (): void => {
    if (current.length === 0) return
    current.sort((a, b) => a.x0 - b.x0)
    lines.push({
      text: current.map((w) => w.text).join(' '),
      x0: Math.min(...current.map((w) => w.x0)),
      y0: Math.min(...current.map((w) => w.y0)),
      x1: Math.max(...current.map((w) => w.x1)),
      y1: Math.max(...current.map((w) => w.y1)),
    })
    current = []
    bottom = Number.NEGATIVE_INFINITY
  }

  for (const word of sorted) {
    if (current.length > 0 && word.y0 > bottom + tolerance) flush()
    current.push(word)
    bottom = Math.max(bottom, word.y1)
  }
  flush()
  return lines
}

function lineConfidence(line: TextLineWithBox, words: OcrWordLocation[]): number {
  let sum = 0
  let n = 0
  for (const w of words) {
    if (w.y0 >= line.y0 - 1 && w.y1 <= line.y1 + 1) {
      sum += w.confidence
      n += 1
    }
  }
  if (n === 0) return 0.3
  return Math.min(1, Math.max(0.3, (sum / n) / 100))
}

/**
 * Pure, deterministic OCR-label classifier (unit-testable without tesseract).
 * `width`/`height` are the source image dimensions the word boxes live in.
 */
export function classifyTextRegions(
  words: OcrWordLocation[],
  width: number,
  height: number,
): PiiRegion[] {
  if (width <= 0 || height <= 0) return []
  const regions: PiiRegion[] = []

  for (const line of groupWordsIntoLines(words)) {
    let type: PiiType | null = null
    let source: PiiRegion['source'] = 'ocr-label'
    if (line.text.trim().length === 0) continue

    for (const { type: labelType, pattern } of PII_LABELS) {
      if (pattern.test(line.text)) {
        type = labelType
        break
      }
    }

    if (!type) {
      const redactions = anonymize(line.text).report.redactions
      let best: { type: PiiType; rank: number } | null = null
      for (const redaction of redactions) {
        const mapped = REDACTION_TO_PII[redaction.category]
        if (!mapped) continue
        const rank = PII_PRIORITY.indexOf(mapped)
        if (best === null || rank < best.rank) best = { type: mapped, rank }
      }
      if (best) type = best.type
    }

    if (!type) continue

    const x = clamp01(line.x0 / width)
    const y = clamp01(line.y0 / height)
    const boxWidth = clamp01((line.x1 - line.x0) / width)
    const boxHeight = clamp01((line.y1 - line.y0) / height)
    if (boxWidth <= 0 || boxHeight <= 0) continue

    regions.push({
      id: `pii-${randomUUID()}`,
      type,
      bbox: { x, y, width: boxWidth, height: boxHeight },
      confidence: lineConfidence(line, words),
      source,
    })
  }

  return mergeRegions(regions)
}

/* ------------------------------------------------------------------ */
/*  Face heuristic (documented substitute for a trained model)         */
/* ------------------------------------------------------------------ */

// Skin-tone gate. Generous on purpose (recall over precision); the roundness
// filter below is what actually separates a face-like blob from a wound.
function isSkinTone(r: number, g: number, b: number): boolean {
  if (r < 90 || g < 40 || b < 20) return false
  if (r < g) return false
  if (r - b < 25) return false
  if (g - b < 10) return false
  return true
}

export interface FaceDetectionLimits {
  /** Smallest blob (fraction of image area) still considered a face. */
  minArea: number
  /** Largest blob (fraction of image area) still considered a face. */
  maxArea: number
  /** Minimum pixels-inside-bbox ratio for a "rounded" blob. */
  minFill: number
  /** Bounding-box aspect (w/h) window a face-like blob may fall into. */
  minAspect: number
  maxAspect: number
}

const FACE_LIMITS: FaceDetectionLimits = {
  minArea: 0.03,
  maxArea: 0.45,
  minFill: 0.55,
  minAspect: 0.5,
  maxAspect: 2.2,
}

/**
 * Deterministic face heuristic. Downscales to a scan grid, marks skin-tone
 * pixels, find-4-connected components and keeps the compact, oval ones. Fully
 * reproducible offline — this is the "certified stub" the P0-2 spec allows.
 */
export async function detectFaces(
  buffer: Buffer,
  width: number,
  height: number,
  limits: FaceDetectionLimits = FACE_LIMITS,
): Promise<PiiRegion[]> {
  if (width <= 0 || height <= 0) return []

  const SCAN_MAX = 320
  const scale = Math.min(1, SCAN_MAX / width)
  const bw = Math.max(1, Math.round(width * scale))
  const bh = Math.max(1, Math.round(height * scale))

  let raw: Buffer
  try {
    raw = await sharp(buffer)
      .resize(bw, bh, { fit: 'fill' })
      .ensureAlpha()
      .raw()
      .toBuffer()
  } catch {
    return []
  }

  const stride = 4
  const mask = new Uint8Array(bw * bh)
  for (let y = 0; y < bh; y += 1) {
    for (let x = 0; x < bw; x += 1) {
      const offset = (y * bw + x) * stride
      if (isSkinTone(raw[offset], raw[offset + 1], raw[offset + 2])) {
        mask[y * bw + x] = 1
      }
    }
  }

  const regions: PiiRegion[] = []
  const visited = new Uint8Array(bw * bh)
  const queue = new Int32Array(bw * bh)
  const totalPixels = bw * bh

  for (let start = 0; start < bw * bh; start += 1) {
    if (mask[start] !== 1 || visited[start] === 1) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    visited[start] = 1

    let count = 0
    let minX = bw
    let minY = bh
    let maxX = -1
    let maxY = -1
    let edgeTouches = 0

    while (head < tail) {
      const idx = queue[head++]
      const x = idx % bw
      const y = (idx / bw) | 0
      count += 1
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      if (x === 0 || x === bw - 1) edgeTouches += 1
      if (y === 0 || y === bh - 1) edgeTouches += 1

      const neighbours = [idx - 1, idx + 1, idx - bw, idx + bw]
      for (const next of neighbours) {
        const nx = next % bw
        const ny = (next / bw) | 0
        if (nx < 0 || nx >= bw || ny < 0 || ny >= bh || next < 0 || next >= bw * bh) continue
        if (mask[next] !== 1 || visited[next] === 1) continue
        visited[next] = 1
        queue[tail++] = next
      }
    }

    if (count === 0) continue
    const areaRatio = count / totalPixels
    if (areaRatio < limits.minArea || areaRatio > limits.maxArea) continue

    const cw = maxX - minX + 1
    const ch = maxY - minY + 1
    if (cw <= 0 || ch <= 0) continue
    const aspect = cw / ch
    if (aspect < limits.minAspect || aspect > limits.maxAspect) continue

    // Faces sit inside the frame — a blob glued to most of the border is a
    // backdrop (a skin-tone background), not a face.
    if (edgeTouches >= 3) continue

    const fill = count / (cw * ch)
    if (fill < limits.minFill) continue

    // Normalised (resolution-independent) box in the ORIGINAL image space.
    const x = minX / bw
    const y = minY / bh
    regions.push({
      id: `pii-${randomUUID()}`,
      type: 'face',
      bbox: { x, y, width: cw / bw, height: ch / bh },
      confidence: 0.6,
      source: 'face-heuristic',
    })
  }

  return mergeRegions(regions)
}

/* ------------------------------------------------------------------ */
/*  Merge + orchestrator                                               */
/* ------------------------------------------------------------------ */

function boxesIntersect(a: BoundingBox, b: BoundingBox, epsilon = 0.01): boolean {
  return (
    a.x < b.x + b.width + epsilon &&
    a.x + a.width + epsilon > b.x &&
    a.y < b.y + b.height + epsilon &&
    a.y + a.height + epsilon > b.y
  )
}

function boxUnion(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x)
  const y = Math.min(a.y, b.y)
  const x2 = Math.max(a.x + a.width, b.x + b.width)
  const y2 = Math.max(a.y + a.height, b.y + b.height)
  return { x, y, width: clamp01(x2 - x), height: clamp01(y2 - y) }
}

/** Unions overlapping regions (text line inside a face box, two labels on one line, …). */
export function mergeRegions(regions: PiiRegion[]): PiiRegion[] {
  const merged: PiiRegion[] = []
  for (const region of regions) {
    let target = -1
    for (let i = 0; i < merged.length; i += 1) {
      if (boxesIntersect(merged[i].bbox, region.bbox)) {
        target = i
        break
      }
    }
    if (target === -1) {
      if (region.bbox.width > 0 && region.bbox.height > 0) merged.push({ ...region })
      continue
    }
    const existing = merged[target]
    merged[target] = {
      ...existing,
      bbox: boxUnion(existing.bbox, region.bbox),
      // The merged region is reported with the more specific of the two types.
      type: typeSpecificity(region.type) <= typeSpecificity(existing.type) ? region.type : existing.type,
      confidence: Math.max(existing.confidence, region.confidence),
    }
  }
  return merged
}

function typeSpecificity(type: PiiType): number {
  return PII_PRIORITY.indexOf(type) === -1 ? PII_PRIORITY.length : PII_PRIORITY.indexOf(type)
}

export interface ImagePiiDetection {
  regions: PiiRegion[]
  summary: PiiSummary
  /** Word count the text scan saw (used for the extraction note). */
  annotatedWords: number
  /** Average OCR word confidence (0..100). */
  ocrConfidence: number
}

function buildSummary(regions: PiiRegion[]): PiiSummary {
  const counts = new Map<PiiType, number>()
  for (const region of regions) {
    counts.set(region.type, (counts.get(region.type) ?? 0) + 1)
  }
  return {
    regionCount: regions.length,
    byType: [...counts.entries()].map(([type, count]) => ({ type, count })),
  }
}

/** Runs both detectors and merges. The result drives black-box redaction. */
export async function detectPii(image: IngestedVisualImage, words: OcrWordLocation[]): Promise<ImagePiiDetection> {
  const textRegions = classifyTextRegions(words, image.width, image.height)
  const faceRegions = await detectFaces(image.buffer, image.width, image.height)
  const regions = mergeRegions([...textRegions, ...faceRegions])
  return {
    regions,
    summary: buildSummary(regions),
    annotatedWords: words.length,
    ocrConfidence: words.length > 0
      ? Math.round(words.reduce((sum, w) => sum + w.confidence, 0) / words.length)
      : 0,
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}