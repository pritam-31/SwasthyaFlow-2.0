import sharp from 'sharp'
import type { IngestedVisualImage } from './imageIngestService'
import type { PiiRegion, VisualConcern, VisualExtraction, VisualFeature, VisualType } from '../types'
import { computeVisualFeatureConfidence, type ImageQuality } from './confidenceService'

/**
 * Non-diagnostic visual feature extraction (P0-2).
 *
 * Margin notes / hard rules:
 *  - Feature analysis runs ONLY on pixels OUTSIDE the PII redaction boxes, so
 *    what "the model sees" is already PII-free (mirrors the text pipeline,
 *    where the parser only ever sees redacted text).
 *  - Output vocabulary is fixed and descriptive: colours, brightness,
 *    texture/detail level, dark-zone geometry. Nothing here names a condition,
 *    a severity or a treatment — concern flags are phrased as questions and
 *    inspection requests only.
 *  - The visual type is inferred from (a) an optional uploader-declared label,
 *    (b) the PUBLISHED (anonymised) intake narrative keywords, or (c) image
 *    statistics — in that order. It is a routing hint, not a diagnosis.
 */

export const VISUAL_DISCLAIMER =
  'NON-DIAGNOSTIC PHOTO DESCRIPTIONS. An AI assistant looked at the REDACTED version of this photo and wrote ' +
  'descriptive observations for review by a qualified healthcare worker. They are not a diagnosis, not a ' +
  'prescription and not a treatment plan. Look at the actual image — nothing here replaces professional ' +
  'medical judgement. Faces are detected with a prototype heuristic, so redactions may be broader than needed.'

const BODY_TYPES: VisualType[] = ['wound', 'rash', 'swelling', 'bruise', 'eye', 'oral', 'ear', 'general', 'unknown']
const DOCUMENT_TYPES: VisualType[] = ['report-photo', 'xray', 'scan']

interface ScanStats {
  meanR: number
  meanG: number
  meanB: number
  stdev: number
  meanLum: number
  stdevLum: number
  darkZones: number
  darkCoverage: number
  textureGrad: number
  unmaskedPixels: number
  totalPixels: number
}

interface TypeGuess {
  type: VisualType
  confidence: number
  basis: string
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'JPG'
    case 'image/png':
      return 'PNG'
    case 'image/heic':
    case 'image/heif':
      return 'HEIC'
    case 'image/webp':
      return 'WEBP'
    default:
      return mime
  }
}

/* ------------------------------------------------------------------ */
/*  Pixel analysis (redaction-excluded)                                */
/* ------------------------------------------------------------------ */

async function analyzePixels(
  buffer: Buffer,
  width: number,
  height: number,
  excluded: PiiRegion[],
): Promise<ScanStats> {
  const SCAN_MAX = 320
  const scale = Math.min(1, SCAN_MAX / width)
  const bw = Math.max(1, Math.round(width * scale))
  const bh = Math.max(1, Math.round(height * scale))

  const raw = await sharp(buffer).resize(bw, bh, { fit: 'fill' }).ensureAlpha().raw().toBuffer()
  const stride = 4

  const excludeMask = new Uint8Array(bw * bh)
  for (const region of excluded) {
    const x0 = Math.max(0, Math.floor(clamp01(region.bbox.x) * bw))
    const y0 = Math.max(0, Math.floor(clamp01(region.bbox.y) * bh))
    const x1 = Math.min(bw, Math.ceil(clamp01(region.bbox.x + region.bbox.width) * bw))
    const y1 = Math.min(bh, Math.ceil(clamp01(region.bbox.y + region.bbox.height) * bh))
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        excludeMask[y * bw + x] = 1
      }
    }
  }

  let unmasked = 0
  let sumR = 0
  let sumG = 0
  let sumB = 0
  let sumLum = 0
  let sumLumSq = 0
  let darkTotal = 0
  let gradTotal = 0
  let gradCount = 0

  const darkMask = new Uint8Array(bw * bh)
  const luminance = new Float32Array(bw * bh)

  for (let y = 0; y < bh; y += 1) {
    for (let x = 0; x < bw; x += 1) {
      const idx = y * bw + x
      if (excludeMask[idx] === 1) continue
      const off = idx * stride
      const r = raw[off]
      const g = raw[off + 1]
      const b = raw[off + 2]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      luminance[idx] = lum
      sumR += r
      sumG += g
      sumB += b
      sumLum += lum
      sumLumSq += lum * lum
      if (lum < 55) {
        darkMask[idx] = 1
        darkTotal += 1
      }
      unmasked += 1
    }
  }

  const total = bw * bh
  const n = unmasked > 0 ? unmasked : 1
  const meanR = sumR / n
  const meanG = sumG / n
  const meanB = sumB / n
  const meanLum = sumLum / n
  const stdev = Math.sqrt(Math.max(0, sumLumSq / n - meanLum * meanLum))

  // Sobel magnitude over the unmasked pixels (masked neighbours contribute 0-edge).
  for (let y = 1; y < bh - 1; y += 1) {
    for (let x = 1; x < bw - 1; x += 1) {
      const idx = y * bw + x
      if (excludeMask[idx] === 1) continue
      const gx =
        -luminance[idx - bw - 1] - 2 * luminance[idx - 1] - luminance[idx + bw - 1] +
        luminance[idx - bw + 1] + 2 * luminance[idx + 1] + luminance[idx + bw + 1]
      const gy =
        -luminance[idx - bw - 1] - 2 * luminance[idx - bw] - luminance[idx - bw + 1] +
        luminance[idx + bw - 1] + 2 * luminance[idx + bw] + luminance[idx + bw + 1]
      gradTotal += Math.sqrt(gx * gx + gy * gy)
      gradCount += 1
    }
  }
  const textureGrad = gradCount > 0 ? gradTotal / gradCount : 0

  // Connected dark zones (mercury in the zone counter only — descriptive).
  const zones = countZones(darkMask, bw, bh, Math.max(2, Math.round(0.001 * total)))

  return {
    meanR,
    meanG,
    meanB,
    stdev,
    meanLum,
    stdevLum: stdev,
    darkZones: zones,
    darkCoverage: unmasked > 0 ? darkTotal / unmasked : 0,
    textureGrad,
    unmaskedPixels: unmasked,
    totalPixels: total,
  }
}

function countZones(mask: Uint8Array, bw: number, bh: number, minSize: number): number {
  const visited = new Uint8Array(bw * bh)
  const queue = new Int32Array(bw * bh)
  let zones = 0
  for (let start = 0; start < bw * bh; start += 1) {
    if (mask[start] !== 1 || visited[start] === 1) continue
    let head = 0
    let tail = 0
    queue[tail++] = start
    visited[start] = 1
    let count = 0
    while (head < tail) {
      const idx = queue[head++]
      count += 1
      for (const next of [idx - 1, idx + 1, idx - bw, idx + bw]) {
        const nx = next % bw
        const ny = (next / bw) | 0
        if (nx < 0 || nx >= bw || ny < 0 || ny >= bh || next < 0 || next >= bw * bh) continue
        if (mask[next] !== 1 || visited[next] === 1) continue
        visited[next] = 1
        queue[tail++] = next
      }
    }
    if (count >= minSize) zones += 1
  }
  return zones
}

type PaletteName = 'reddish-brown' | 'greenish' | 'bluish' | 'pale' | 'dark' | 'greyish' | 'multi-toned'

function dominantPalette(stats: ScanStats): PaletteName {
  const { meanR, meanG, meanB } = stats
  const max = Math.max(meanR, meanG, meanB)
  const min = Math.min(meanR, meanG, meanB)
  if (max > 200 && min > 150) return 'pale'
  if (max < 55 && min < 45) return 'dark'
  const spread = max - min
  if (spread < 24) return 'greyish'
  if (meanR >= meanG && meanR >= meanB && meanR - meanG > 18) return 'reddish-brown'
  if (meanG >= meanB && meanG - meanB > 18) return 'greenish'
  if (meanB >= meanR && meanB - meanR > 18) return 'bluish'
  return 'multi-toned'
}

type TextureLevel = 'Low' | 'Medium' | 'High'

function textureLevel(grad: number): TextureLevel {
  if (grad < 12) return 'Low'
  if (grad < 30) return 'Medium'
  return 'High'
}

/* ------------------------------------------------------------------ */
/*  Type inference                                                     */
/* ------------------------------------------------------------------ */

const DECLARED_TYPES: VisualType[] = [
  'wound',
  'rash',
  'report-photo',
  'xray',
  'scan',
  'swelling',
  'bruise',
  'eye',
  'oral',
  'ear',
  'general',
]

type BasisFn = (text: string, stats: ScanStats) => string

const TYPE_RULES: Array<{ type: VisualType; test: (text: string, stats: ScanStats, words: number) => boolean; basis: BasisFn; confidence: number }> = [
  {
    type: 'report-photo',
    test: (text, _stats, words) =>
      words >= 5 && /\b(report|prescription|name\s?plate|lab|blood|specimen|test|values?|result|referral)\b/i.test(text),
    basis: () => 'OCR found document-like text plus narrative clues — treated as a photograph of a document',
    confidence: 0.85,
  },
  {
    type: 'xray',
    test: (text, _stats) => /\b(x-?ray|radiograph)\b/i.test(text),
    basis: () => 'the patient narrative mentions an X-ray / radiograph',
    confidence: 0.85,
  },
  {
    type: 'scan',
    test: (text) =>
      /\b(mri|magnetic resonance|ct scan|computed tomography|ultrasound|sonograph|echocardiograph|usg|scan)\b/i.test(text),
    basis: () => 'the patient narrative mentions an imaging scan (MRI / CT / ultrasound / scan)',
    confidence: 0.85,
  },
  {
    type: 'wound',
    test: (text) => /\b(wound|cut|injur|ulcer|boil|abscess|burn|bite)\b/i.test(text),
    basis: () => 'the patient narrative mentions a wound / cut / injury / ulcer / burn',
    confidence: 0.9,
  },
  {
    type: 'rash',
    test: (text) => /\b(rash|itch|itching|reddish patch|skin patch)\b/i.test(text),
    basis: () => 'the patient narrative mentions a rash / itching / skin patch',
    confidence: 0.9,
  },
  {
    type: 'swelling',
    test: (text) => /\b(swelling|swollen|oedema|edema)\b/i.test(text),
    basis: () => 'the patient narrative mentions swelling',
    confidence: 0.9,
  },
  {
    type: 'bruise',
    test: (text) => /\b(bruis|black and blue|discolouration)\b/i.test(text),
    basis: () => 'the patient narrative mentions a bruise / discolouration',
    confidence: 0.9,
  },
  {
    type: 'eye',
    test: (text) => /\b(eye[s]?|vision|eyelid|conjunctiv)\b/i.test(text),
    basis: () => 'the patient narrative mentions the eye(s) / vision',
    confidence: 0.9,
  },
  {
    type: 'oral',
    test: (text) => /\b(mouth|tongue|gums?|teeth|oral|throat|tonsil)\b/i.test(text),
    basis: () => 'the patient narrative mentions the mouth / oral area',
    confidence: 0.9,
  },
  {
    type: 'ear',
    test: (text) => /\b(ear|hearing|auricle)\b/i.test(text),
    basis: () => 'the patient narrative mentions the ear / hearing',
    confidence: 0.9,
  },
]

// Pixel-statistics-only fallbacks run AFTER every narrative rule, so a
// narrative clue always wins over a purely visual guess (bright
// radiograph-style captures are the main exception worth catching).
const PIXEL_FALLBACK_RULES: Array<{ type: VisualType; test: (stats: ScanStats) => boolean; basis: BasisFn; confidence: number }> = [
  {
    type: 'xray',
    test: (stats) => stats.meanLum >= 150 && stats.stdev < 28,
    basis: () => 'the image is very bright and almost monochrome — radiograph-like capture',
    confidence: 0.7,
  },
]

function inferType(text: string, stats: ScanStats, words: number, declared?: VisualType): TypeGuess {
  // An uploader-declared label wins — the person is the best authority.
  if (declared && DECLARED_TYPES.includes(declared)) {
    return { type: declared, confidence: 0.95, basis: `the uploader labelled it as "${declared}"` }
  }
  for (const rule of TYPE_RULES) {
    if (rule.test(text, stats, words)) {
      return { type: rule.type, confidence: rule.confidence, basis: rule.basis(text, stats) }
    }
  }
  for (const rule of PIXEL_FALLBACK_RULES) {
    if (rule.test(stats)) {
      return { type: rule.type, confidence: rule.confidence, basis: rule.basis(text, stats) }
    }
  }
  return { type: 'unknown', confidence: 0.55, basis: 'no strong visual or narrative signal — left for the reviewer' }
}

/* ------------------------------------------------------------------ */
/*  Feature rows + appearance + concerns                               */
/* ------------------------------------------------------------------ */

/** Coarse image-quality bucket derived only from published pixel statistics. */
function imageQualityOf(stats: ScanStats): ImageQuality {
  if (stats.stdev < 12 || stats.meanLum < 30 || stats.meanLum > 225) return 'poor'
  if (stats.stdev < 28) return 'fair'
  return 'good'
}

function buildFeatures(image: IngestedVisualImage, stats: ScanStats, ocrWords: number): VisualFeature[] {
  const palette = dominantPalette(stats)
  const texture = textureLevel(stats.textureGrad)
  const darkText = stats.darkZones > 0
    ? `${stats.darkZones} zone(s) — ~${Math.round(stats.darkCoverage * 100)}% of the photo`
    : 'None found'
  return [
    {
      id: 'res',
      label: 'Stored resolution',
      value: `${image.width} × ${image.height} px`,
      confidence: 1,
    },
    {
      id: 'file',
      label: 'Original file',
      value: `${formatMime(image.originalMimeType)} · ${formatBytes(image.originalSizeBytes)}${image.converted ? ' (converted to JPEG)' : ''}`,
      confidence: 1,
    },
    {
      id: 'colour',
      label: 'Dominant colour',
      value: palette,
      confidence: 0.8,
    },
    {
      id: 'range',
      label: 'Colour range',
      value: stats.stdev < 28 ? 'Uniform' : 'Varied',
      confidence: 0.7,
    },
    {
      id: 'brightness',
      label: 'Mean brightness (0-255)',
      value: String(Math.round(stats.meanLum)),
      confidence: 0.9,
    },
    {
      id: 'dark',
      label: 'Dark zones (outside redactions)',
      value: darkText,
      confidence: 0.65,
    },
    {
      id: 'texture',
      label: 'Texture detail level',
      value: texture,
      confidence: 0.6,
    },
    {
      id: 'ocr',
      label: 'OCR text words found',
      value: String(ocrWords),
      confidence: 1,
    },
    {
      id: 'exif',
      label: 'EXIF / GPS / device metadata',
      value: image.sourceExifStripped ? 'Stripped on intake' : 'None present',
      confidence: 1,
    },
  ]
}

function buildAppearance(
  image: IngestedVisualImage,
  stats: ScanStats,
  ocrWords: number,
  faceCount: number,
): string[] {
  const notes: string[] = []
  const bodyLike = stats.unmaskedPixels / Math.max(1, stats.totalPixels) >= 0.5
  if (stats.meanLum >= 150 && stats.stdev < 28) {
    notes.push('The photo is very bright with minimal colour — radiograph-style capture.')
  }
  if (bodyLike) {
    notes.push(`Dominant tones read as "${dominantPalette(stats)}" with ${textureLevel(stats.textureGrad).toLowerCase()} texture detail.`)
    if (stats.darkZones > 0) {
      notes.push(`Outside redactions, ${stats.darkZones} distinctly darker zone(s) cover about ${Math.round(stats.darkCoverage * 100)}% of the photo.`)
    }
  }
  if (ocrWords > 0) {
    notes.push(`OCR read ${ocrWords} word(s) of text in the photo.`)
  }
  if (image.sourceExifStripped) {
    notes.push('EXIF metadata (including GPS location, if any) was stripped before anything was stored.')
  }
  if (faceCount > 0) {
    notes.push(`${faceCount} face-like region(s) were detected with the prototype face heuristic and black-boxed.`)
  }
  if (notes.length === 0) {
    notes.push('The photos holds recognisable visual information for a clinician to review directly.')
  }
  return notes
}

function buildConcerns(type: VisualType, stats: ScanStats): VisualConcern[] {
  if (!BODY_TYPES.includes(type)) return []
  const concerns: VisualConcern[] = []
  if (stats.darkZones > 0) {
    concerns.push({
      id: 'vis-1',
      severity: 'amber',
      label: 'Darker zone(s) present',
      reason: `The photo shows ${stats.darkZones} area(s) distinctly darker than their surroundings (about ${Math.round(stats.darkCoverage * 100)}% of the photo, redactions excluded). Darker appearance has many possible causes — please look at the area in person.`,
      ruleId: 'VIS-01',
      suggestedAction: 'Ask the patient how long the area has looked this way and whether it has changed since the photo.',
    })
  }
  if (textureLevel(stats.textureGrad) === 'High') {
    concerns.push({
      id: 'vis-2',
      severity: 'amber',
      label: 'Highly uneven surface appearance',
      reason: 'The surface in the photo looks highly uneven at this resolution, which is worth an in-person look rather than relying solely on the photograph.',
      ruleId: 'VIS-02',
      suggestedAction: 'Ask whether the area has grown or changed recently.',
    })
  }
  return concerns
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface VisualAnalysisInput {
  image: IngestedVisualImage
  /** PII boxes already detected — the analysis excludes their pixels. */
  piiRegions: PiiRegion[]
  /** Word count + average OCR confidence from the PII scan. */
  ocrWords: number
  ocrConfidence: number
  /** ANONYMISED narrative text only (session.displayText). */
  sourceText: string
  /** Optional uploader-declared visual type. */
  declaredType?: VisualType
}

export interface VisualAnalysis {
  extraction: VisualExtraction
  warnings: string[]
}

export async function analyzeVisualImage(input: VisualAnalysisInput): Promise<VisualAnalysis> {
  const { image, piiRegions, ocrWords, ocrConfidence, sourceText, declaredType } = input
  const stats = await analyzePixels(image.buffer, image.width, image.height, piiRegions)
  const guess = inferType(sourceText, stats, ocrWords, declaredType)

  const faceCount = piiRegions.filter((r) => r.source === 'face-heuristic').length
  const type = guess.type
  const concerns = buildConcerns(type, stats)
  const appearance = buildAppearance(image, stats, ocrWords, faceCount)

  const imageQuality = imageQualityOf(stats)
  const ocrCorroborated = ocrWords > 0
  const features = buildFeatures(image, stats, ocrWords)
  for (const feature of features) {
    feature.confidenceScore = computeVisualFeatureConfidence({ feature, imageQuality, ocrCorroborated })
  }

  const warnings: string[] = []
  if (concerns.length === 0) {
    warnings.push(`No body-surface concern flags were raised for this photo — the descriptive rows above still need a human look.`)
  }
  if (DOCUMENT_TYPES.includes(type)) {
    warnings.push('This was treated as a document/radiograph photo, so no body-surface colour analysis was performed.')
  }

  return {
    extraction: {
      visualType: type,
      typeConfidence: guess.confidence,
      typeBasis: guess.basis,
      appearance,
      features,
      concerns,
      annotatedWords: ocrWords,
      ocrConfidence,
    },
    warnings,
  }
}

export { formatMime, formatBytes }