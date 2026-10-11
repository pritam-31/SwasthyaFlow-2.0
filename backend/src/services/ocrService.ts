import { PDFParse } from 'pdf-parse'
import { createWorker, type Worker } from 'tesseract.js'
import type { ReportOcrMeta } from '../types'
import { computeOcrConfidence } from './confidenceService'

/**
 * Text extraction for uploaded reports (P0-1).
 *
 *  - PDFs: use the native text layer first (`pdf-parse`); image-only/scanned
 *    PDFs fall back to rendering each page and OCR-ing it (`tesseract.js`).
 *  - Images (JPEG/PNG): OCR directly with the English + Hindi + Oriya packs.
 *  - Extraction NEVER throws: every failure degrades to `engine: 'nothing'`
 *    plus a warning, so the upload is still stored for manual reading.
 */

/** English + Hindi + Oriya (`ori` is Tesseract's code for Odia). */
const TESSERACT_LANGUAGES = ['eng', 'hin', 'ori']
/** If a language pack cannot load (e.g. offline), retry with English alone. */
const LANGUAGE_FALLBACKS: string[][] = [TESSERACT_LANGUAGES, ['eng']]

const OCR_TIMEOUT_MS = 60_000
const PDF_TEXT_TIMEOUT_MS = 30_000
const PDF_RENDER_TIMEOUT_MS = 60_000
/** Below this, a PDF "text layer" is considered empty (a scanned document). */
const MIN_NATIVE_TEXT_CHARS = 30
/** OCR confidence under this gets a verification warning on the report. */
const LOW_CONFIDENCE = 70

export interface OcrResult {
  text: string
  meta: ReportOcrMeta
  warnings: string[]
}

export interface OcrWordLocation {
  text: string
  /** 0..100 per-word OCR confidence. */
  confidence: number
  /** Word bounding box in source-image pixels. */
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface OcrWordsResult {
  text: string
  /** Average word confidence (0..100); 0 when nothing was read. */
  confidence: number
  words: OcrWordLocation[]
  warnings: string[]
}

/* ------------------------------------------------------------------ */
/*  Worker lifecycle (one shared worker, recognitions serialised)      */
/* ------------------------------------------------------------------ */

let workerPromise: Promise<Worker | null> | null = null
/** Serialises recognitions — tesseract.js runs one job at a time anyway. */
let recognitionQueue: Promise<unknown> = Promise.resolve()

function logWarn(message: string, detail?: unknown): void {
  console.warn(`[ocr] ${message}${detail === undefined ? '' : ` — ${String(detail)}`}`)
}

/**
 * tesseract.js reports job failures both by rejecting the job promise and by
 * invoking `errorHandler`. Without the handler the second path rethrows on the
 * event loop and would crash the server, so the handler is mandatory.
 */
function onWorkerError(error: unknown): void {
  logWarn('tesseract error (suppressed by errorHandler)', error)
}

async function initWorker(): Promise<Worker | null> {
  for (const languages of LANGUAGE_FALLBACKS) {
    try {
      return await createWorker(languages, 1, { errorHandler: onWorkerError })
    } catch (error) {
      logWarn(`worker init failed for [${languages.join(', ')}]`, error)
    }
  }
  return null
}

function getWorker(): Promise<Worker | null> {
  if (!workerPromise) {
    workerPromise = initWorker().catch((error: unknown) => {
      logWarn('worker init rejected', error)
      return null
    })
  }
  return workerPromise
}

/** Drops the cached worker so the next OCR attempt re-initialises it. */
function resetWorker(): void {
  workerPromise = null
}

/** Terminates the shared worker (test teardown / graceful shutdown). */
export async function shutdownOcr(): Promise<void> {
  const worker = await workerPromise
  workerPromise = null
  if (worker) {
    try {
      await worker.terminate()
    } catch (error) {
      logWarn('worker.terminate failed', error)
    }
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms)
    timer.unref()
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

function serialize<T>(job: () => Promise<T>): Promise<T> {
  const next = recognitionQueue.then(job, job)
  recognitionQueue = next.then(
    () => undefined,
    () => undefined,
  )
  return next
}

async function recognize(image: Buffer): Promise<{ text: string; confidence: number }> {
  return serialize(async () => {
    const worker = await getWorker()
    if (!worker) throw new Error('OCR engine unavailable (language packs could not be loaded)')
    try {
      const result = await withTimeout(worker.recognize(image), OCR_TIMEOUT_MS, 'OCR recognition')
      return { text: result.data.text ?? '', confidence: result.data.confidence }
    } catch (error) {
      // A worker that failed mid-job is not trustworthy — rebuild it next time.
      resetWorker()
      throw error
    }
  })
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Build OCR metadata with the deterministic explanation score attached. */
function metaWith(engine: ReportOcrMeta['engine'], confidence: number, pages: number): ReportOcrMeta {
  const meta: ReportOcrMeta = { engine, confidence, pages }
  meta.confidenceScore = computeOcrConfidence(meta)
  return meta
}

/** OCR a JPEG/PNG report photograph. Never throws. */
export async function extractTextFromImage(buffer: Buffer): Promise<OcrResult> {
  const warnings: string[] = []
  if (buffer.length === 0) {
    return { text: '', meta: metaWith('nothing', 0, 0), warnings: ['The uploaded image was empty.'] }
  }
  try {
    const { text, confidence } = await recognize(buffer)
    const trimmed = text.trim()
    if (!trimmed) {
      warnings.push('OCR read no text from this image — read the values manually from the original.')
      return { text: '', meta: metaWith('nothing', 0, 1), warnings }
    }
    if (confidence < LOW_CONFIDENCE) {
      warnings.push(`OCR confidence is low (${confidence}%) — verify every value against the original document.`)
    }
    return { text, meta: metaWith('tesseract', confidence, 1), warnings }
  } catch (error) {
    warnings.push(`OCR failed (${describeError(error)}) — nothing was extracted; no values were inferred.`)
    return { text: '', meta: metaWith('nothing', 0, 0), warnings }
  }
}

/**
 * OCR a JPEG/PNG image with per-word bounding boxes (P0-2 visual PII scan).
 * The words are used to locate text-based PII so the image can be redacted by
 * region. Never throws — a failure degrades to an empty word list plus a
 * warning, and text-based redaction is then skipped rather than guessing.
 */
export async function extractWordsFromImage(buffer: Buffer): Promise<OcrWordsResult> {
  const warnings: string[] = []
  if (buffer.length === 0) {
    return { text: '', confidence: 0, words: [], warnings: ['The uploaded image was empty.'] }
  }
  try {
    const data = await serialize(async () => {
      const worker = await getWorker()
      if (!worker) throw new Error('OCR engine unavailable (language packs could not be loaded)')
      try {
        const result = await withTimeout(worker.recognize(buffer), OCR_TIMEOUT_MS, 'OCR recognition')
        return result.data
      } catch (error) {
        // A worker that failed mid-job is not trustworthy — rebuild it next time.
        resetWorker()
        throw error
      }
    })
    const pageData = data as any
    const words: OcrWordLocation[] = (pageData.words ?? []).flatMap((word: any) => {
      const text = word?.text?.trim() ?? ''
      if (!text) return []
      const b = word.bbox
      return [
        {
          text,
          confidence: typeof word.confidence === 'number' ? word.confidence : 0,
          x0: b?.x0 ?? 0,
          y0: b?.y0 ?? 0,
          x1: b?.x1 ?? 0,
          y1: b?.y1 ?? 0,
        },
      ]
    })
    const confidence = words.length > 0
      ? Math.round(words.reduce((sum, w) => sum + w.confidence, 0) / words.length)
      : 0
    if (words.length === 0) {
      warnings.push('No readable text was found in this photo — text-based PII scanning found nothing to redact.')
    }
    return { text: pageData.text ?? '', confidence, words, warnings }
  } catch (error) {
    warnings.push(`Text scan failed (${describeError(error)}) — text-based redaction was skipped.`)
    return { text: '', confidence: 0, words: [], warnings }
  }
}

/** Extract text from a PDF: native layer first, rendered-page OCR as fallback. */
export async function extractTextFromPdf(buffer: Buffer): Promise<OcrResult> {
  const warnings: string[] = []
  if (buffer.length === 0) {
    return { text: '', meta: metaWith('nothing', 0, 0), warnings: ['The uploaded PDF was empty.'] }
  }

  let parser: PDFParse | null = null
  let nativeText = ''
  let nativePages = 0
  try {
    parser = new PDFParse({ data: new Uint8Array(buffer) })
    const result = await withTimeout(parser.getText({ pageJoiner: '' }), PDF_TEXT_TIMEOUT_MS, 'PDF text extraction')
    nativeText = result.text ?? ''
    nativePages = result.pages.length
  } catch (error) {
    warnings.push(`PDF text extraction failed (${describeError(error)}).`)
  }

  const native = nativeText.trim()
  if (native.length >= MIN_NATIVE_TEXT_CHARS) {
    await destroyQuietly(parser)
    return { text: nativeText, meta: metaWith('pdf-text', 100, nativePages), warnings }
  }

  // Image-only ("scanned") PDF: render each page and OCR the screenshots.
  if (!parser) {
    warnings.push('No text layer could be read from this PDF — upload a clearer scan or read the values manually.')
    return { text: '', meta: metaWith('nothing', 0, 0), warnings }
  }

  try {
    const shots = await withTimeout(
      parser.getScreenshot({ imageBuffer: true, imageDataUrl: false, scale: 1.5 }),
      PDF_RENDER_TIMEOUT_MS,
      'PDF page rendering',
    )
    const texts: string[] = []
    let confidenceTotal = 0
    let confidencePages = 0
    for (const page of shots.pages) {
      try {
        const { text, confidence } = await recognize(Buffer.from(page.data))
        if (text.trim()) {
          texts.push(text)
          confidenceTotal += confidence
          confidencePages += 1
        }
      } catch (error) {
        warnings.push(`OCR failed for page ${page.pageNumber} (${describeError(error)}).`)
      }
    }
    const text = texts.join('\n')
    const pages = shots.pages.length
    if (!text.trim()) {
      warnings.push('No text layer and no OCR output — read the values manually from the original document.')
      await destroyQuietly(parser)
      return { text: '', meta: metaWith('nothing', 0, pages), warnings }
    }
    const confidence = confidencePages > 0 ? Math.round(confidenceTotal / confidencePages) : 0
    warnings.unshift(
      `No text layer found — the values below came from OCR (${confidence}% confidence) and must be checked against the original.`,
    )
    if (confidence < LOW_CONFIDENCE) {
      warnings.push(`OCR confidence is low (${confidence}%) — verify every value manually.`)
    }
    await destroyQuietly(parser)
    return { text, meta: metaWith('tesseract', confidence, pages), warnings }
  } catch (error) {
    warnings.push(`Rendered OCR failed (${describeError(error)}) — no values were inferred.`)
    await destroyQuietly(parser)
    return { text: '', meta: metaWith('nothing', 0, 0), warnings }
  }
}

async function destroyQuietly(parser: PDFParse | null): Promise<void> {
  if (!parser) return
  try {
    await parser.destroy()
  } catch (error) {
    logWarn('parser.destroy failed', error)
  }
}
