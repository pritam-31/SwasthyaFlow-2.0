/**
 * Client-side report file rules — mirror the backend's multer/service guards
 * (backend/src/services/reportService.ts) so bad files fail fast, before they
 * hit the server. PDF / JPEG / PNG only, ≤ 5 files, ≤ 10 MB each.
 */

export const MAX_REPORT_FILES = 5
export const MAX_REPORT_SIZE_BYTES = 10 * 1024 * 1024
const ACCEPTED = new Set(['application/pdf', 'image/jpeg', 'image/png'])

/** Returns human-readable problems for a file list; empty array when all files are acceptable. */
export function validateReportFiles(files: File[]): string[] {
  const errors: string[] = []
  if (files.length === 0) return ['Choose at least one report file.']
  if (files.length > MAX_REPORT_FILES) errors.push(`Up to ${MAX_REPORT_FILES} files per upload.`)
  files.forEach((f) => {
    if (!ACCEPTED.has(f.type)) errors.push(`"${f.name}" is not a supported type — upload a PDF, JPEG or PNG.`)
    else if (f.size > MAX_REPORT_SIZE_BYTES) errors.push(`"${f.name}" is larger than 10 MB.`)
  })
  return errors
}