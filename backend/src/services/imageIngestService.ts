import sharp from 'sharp'
import { HttpError } from '../middleware/errorHandler'
import type { VisualUploadFile } from '../types'

/**
 * Visual image ingestion (P0-2).
 *
 * Every uploaded photo follows the same normalisation, in order:
 *  1. type / size / magic-byte guard (JPG, PNG, HEIC, HEIF, WEBP; ≤ 10 MB)
 *  2. decode + auto-rotate (EXIF orientation is baked into the pixels)
 *  3. downscale so neither side exceeds 4096 px (`inside` fit, never upscales)
 *  4. re-encode as JPEG — sharp drops metadata unless `withMetadata` is
 *     explicitly requested, so this single step strips EXIF (including any
 *     GPS coordinates) without ever reading it. Nothing survives.
 *  5. delete the original buffer (caller responsibility).
 *
 * Wasted bytes on a downscaled image are disposable; the PHI a phone camera
 * embeds (location, timestamp, device) is not — hence metadata is stripped with
 * no exceptions.
 */

export const MAX_VISUAL_BYTES = 10 * 1024 * 1024
export const MAX_VISUAL_DIMENSION = 4096
export const STORED_IMAGE_MIME = 'image/jpeg' as const

const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'])

export interface IngestedVisualImage {
  /** Normalised, EXIF-stripped JPEG (what gets redacted and stored). */
  buffer: Buffer
  width: number
  height: number
  originalMimeType: string
  originalSizeBytes: number
  /** True when the source carried EXIF metadata that was stripped. */
  sourceExifStripped: boolean
  /** True when the source format was not JPEG (pixel format conversion happened). */
  converted: boolean
}

function magicMatches(mime: string, buffer: Buffer): boolean {
  switch (mime) {
    case 'image/jpeg':
      return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff
    case 'image/png':
      return buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47
    case 'image/webp':
      return (
        buffer.length >= 12 &&
        buffer.toString('latin1', 0, 4) === 'RIFF' &&
        buffer.toString('latin1', 8, 12) === 'WEBP'
      )
    case 'image/heic':
    case 'image/heif':
      // ISO Base Media container with an HEIF brand (heic / heix / hevc / hevx / mif1 / msf1 / avif).
      if (buffer.length < 12 || buffer.toString('latin1', 4, 8) !== 'ftyp') return false
      const brand = buffer.toString('latin1', 8, 12)
      return ['heic', 'heix', 'hevc', 'hevx', 'mif1', 'msf1', 'avif'].includes(brand)
    default:
      return false
  }
}

/** Guard + normalisation. Throws 415/400/413 on anything that must not be processed. */
export async function ingestVisualImage(file: VisualUploadFile): Promise<IngestedVisualImage> {
  const mime = file.mimeType ?? ''
  if (!ALLOWED_MIME.has(mime)) {
    throw new HttpError(415, `Unsupported file type "${mime}" — upload a JPG, PNG, HEIC, HEIF or WEBP photo.`)
  }
  if (file.size <= 0 || file.buffer.length === 0) {
    throw new HttpError(400, 'The uploaded image was empty.')
  }
  if (file.size > MAX_VISUAL_BYTES) {
    throw new HttpError(413, 'The image is too large — the limit is 10 MB per photo.')
  }
  if (!magicMatches(mime, file.buffer)) {
    throw new HttpError(400, 'Corrupt or unreadable image — the content does not match its declared type.')
  }

  let normalized: Buffer
  try {
    normalized = await sharp(file.buffer)
      .rotate() // bake EXIF orientation into the pixels
      .resize(MAX_VISUAL_DIMENSION, MAX_VISUAL_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 88 })
      .toBuffer()
  } catch (error) {
    throw new HttpError(400, 'Corrupt or unreadable image — the photo could not be decoded.')
  }

  const outMeta = await sharp(normalized).metadata()
  const width = outMeta.width ?? 0
  const height = outMeta.height ?? 0
  if (width === 0 || height === 0) {
    throw new HttpError(400, 'Corrupt or unreadable image — no usable pixels could be read.')
  }

  const sourceExifStripped = await hasExif(file.buffer)
  return {
    buffer: normalized,
    width,
    height,
    originalMimeType: mime,
    originalSizeBytes: file.size,
    sourceExifStripped,
    converted: mime !== STORED_IMAGE_MIME,
  }
}

/** True when the source file embeds EXIF metadata (which this pipeline will strip). */
async function hasExif(buffer: Buffer): Promise<boolean> {
  try {
    const meta = await sharp(buffer, { failOn: 'none' }).metadata()
    return typeof meta.exif === 'object' && meta.exif !== null && meta.exif.length > 0
  } catch {
    return false
  }
}