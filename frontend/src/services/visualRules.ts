/**
 * Client-side photo file rules — mirror the backend's multer/service guards
 * (backend/src/routes/visuals.routes.ts, backend/src/services/imageIngestService.ts)
 * so bad files fail fast, before they hit the server.
 * JPG / PNG / HEIC / HEIF / WEBP only, ≤ 5 files, ≤ 10 MB each.
 */

export const MAX_VISUAL_FILES = 5
export const MAX_VISUAL_SIZE_BYTES = 10 * 1024 * 1024

const ACCEPTED = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
])

/** Returns human-readable problems for a file list; empty array when all files are acceptable. */
export function validateVisualFiles(files: File[]): string[] {
  const errors: string[] = []
  if (files.length === 0) return ['Choose at least one photo.']
  if (files.length > MAX_VISUAL_FILES) errors.push(`Up to ${MAX_VISUAL_FILES} photos per upload.`)
  files.forEach((f) => {
    if (!ACCEPTED.has(f.type)) errors.push(`"${f.name}" is not a supported type — upload a JPG, PNG, HEIC or WEBP photo.`)
    else if (f.size > MAX_VISUAL_SIZE_BYTES) errors.push(`"${f.name}" is larger than 10 MB.`)
  })
  return errors
}
