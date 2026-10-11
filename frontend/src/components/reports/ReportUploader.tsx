/**
 * Report file uploader for an existing session (reviewer side).
 *
 * Validates files client-side (PDF / JPEG / PNG, ≤ 5 files, ≤ 10 MB each —
 * mirrors the backend guards), uploads them, then shows what was extracted.
 */

import { FilePlus2, Loader2, Paperclip, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTriage } from '../../context/TriageContext'
import { useOffline } from '../../context/OfflineContext'
import { validateReportFiles } from '../../services/reportRules'
import type { ReportExtractionResult } from '../../types/report.types'
import { cx } from '../ui'
import ReportPreview from './ReportPreview'

export default function ReportUploader({ sessionId }: { sessionId: string }) {
  const { uploadReportsToSession } = useTriage()
  const { online } = useOffline()
  const inputRef = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<File[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<ReportExtractionResult[] | null>(null)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...staged, ...Array.from(list)]
    setErrors(validateReportFiles(next))
    setStaged([...new Map(next.map((f) => [f.name + f.size, f])).values()])
    setResults(null)
  }

  const removeFile = (name: string) => {
    const next = staged.filter((f) => f.name + f.size !== name)
    setStaged(next)
    setErrors([])
  }

  const upload = async () => {
    const validation = validateReportFiles(staged)
    setErrors(validation)
    if (validation.length > 0) return
    setUploading(true)
    setResults(null)
    const outcome = await uploadReportsToSession(sessionId, staged)
    if (outcome.ok) {
      setResults(outcome.results)
      setStaged([])
    } else {
      setErrors([outcome.error ?? 'The backend could not process the upload.'])
    }
    setUploading(false)
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold text-ink-700">
          <FilePlus2 size={14} className="text-brand-600" /> Add a PDF / JPEG / PNG report
        </p>
        {results === null && staged.length === 0 && (
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            multiple
            className="sr-only"
            onChange={(e) => {
              addFiles(e.target.files)
              e.target.value = ''
            }}
          />
        )}
      </div>

      {!online && results === null && (
        <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          File uploads need a connection. Reconnect to attach reports — queued clinical notes are unaffected.
        </p>
      )}

      {results === null && (
        <>
          {staged.length === 0 && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading || !online}
              className="mt-3 flex min-h-[92px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-ink-300 bg-ink-50/40 text-center transition hover:border-brand-400 hover:bg-brand-50/40 disabled:opacity-50"
            >
              <Paperclip size={16} className="text-brand-600" />
              <span className="text-xs font-bold text-ink-700">Choose files</span>
              <span className="text-[11px] text-ink-400">PDF, JPEG or PNG · up to 5 files · 10 MB each</span>
            </button>
          )}

          {staged.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {staged.map((f) => (
                <li key={f.name + f.size} className="flex items-center gap-2 rounded-lg bg-ink-50 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-ink-700">{f.name}</span>
                  <span className="text-[11px] text-ink-400">{(f.size / 1024).toFixed(0)} KB</span>
                  <button
                    type="button"
                    className="rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-rose-600"
                    onClick={() => removeFile(f.name + f.size)}
                    aria-label={`Remove ${f.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {staged.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={() => inputRef.current?.click()}
                  className="rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-500 ring-1 ring-inset ring-ink-200 hover:bg-ink-50"
                >
                  Add more
                </button>
                <button
                  type="button"
                  onClick={upload}
                  disabled={uploading || !online}
                  className={cx(
                    'inline-flex items-center gap-2 rounded-lg bg-gradient-to-b from-brand-600 to-brand-700 px-3 py-1.5 text-xs font-bold text-white ring-1 ring-inset ring-brand-700 hover:from-brand-700 hover:to-brand-800 disabled:from-ink-200 disabled:to-ink-200 disabled:text-ink-400',
                  )}
                >
                  {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                  {uploading ? 'Reading reports…' : `Upload ${staged.length} report(s)`}
                </button>
              </>
            )}
          </div>

          {errors.length > 0 && (
            <ul role="alert" className="mt-2 space-y-1 rounded-lg bg-rose-50 px-3 py-2">
              {errors.map((e) => (
                <li key={e} className="text-[11px] font-semibold text-rose-700">
                  {e}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {results && (
        <div className="mt-3 space-y-2.5">
          <p className="rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">
            {results.length} report(s) read and stored — extracted values await verification.
          </p>
          {results.map((r) => (
            <ReportPreview key={r.report.id} report={r.report} />
          ))}
          <button
            type="button"
            onClick={() => setResults(null)}
            className="text-[11px] font-bold text-brand-700 hover:text-brand-900"
          >
            Upload another report
          </button>
        </div>
      )}
    </div>
  )
}