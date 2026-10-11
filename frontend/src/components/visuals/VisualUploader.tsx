/**
 * Photo uploader for an existing session (reviewer side).
 *
 * Validates files client-side (JPG / PNG / HEIC / WEBP, ≤ 5 files, ≤ 10 MB each
 * — mirrors the backend guards), uploads them, then shows what was extracted.
 */

import { Camera, Image as ImageIcon, Loader2, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useTriage } from '../../context/TriageContext'
import { useOffline } from '../../context/OfflineContext'
import { VISUAL_TYPE_LABELS } from '../../services/safetyPolicy'
import { validateVisualFiles } from '../../services/visualRules'
import type { VisualExtractionResult } from '../../types/visual.types'
import { cx } from '../ui'
import VisualPreview from './VisualPreview'

const DECLARED_TYPES = Object.keys(VISUAL_TYPE_LABELS) as Array<keyof typeof VISUAL_TYPE_LABELS>

export default function VisualUploader({ sessionId }: { sessionId: string }) {
  const { uploadVisualsToSession } = useTriage()
  const { online } = useOffline()
  const inputRef = useRef<HTMLInputElement>(null)
  const [staged, setStaged] = useState<File[]>([])
  const [declaredType, setDeclaredType] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [results, setResults] = useState<VisualExtractionResult[] | null>(null)

  const addFiles = (list: FileList | null) => {
    if (!list) return
    const next = [...staged, ...Array.from(list)]
    setErrors(validateVisualFiles(next))
    setStaged([...new Map(next.map((f) => [f.name + f.size, f])).values()])
    setResults(null)
  }

  const removeFile = (name: string) => {
    setStaged((prev) => prev.filter((f) => f.name + f.size !== name))
    setErrors([])
  }

  const upload = async () => {
    const validation = validateVisualFiles(staged)
    setErrors(validation)
    if (validation.length > 0) return
    setUploading(true)
    setResults(null)
    const outcome = await uploadVisualsToSession(sessionId, staged, declaredType || undefined)
    if (outcome.ok) {
      setResults(outcome.results)
      setStaged([])
      setDeclaredType('')
    } else {
      setErrors([outcome.error ?? 'The backend could not process the upload.'])
    }
    setUploading(false)
  }

  return (
    <div className="rounded-2xl border border-ink-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-bold text-ink-700">
          <Camera size={14} className="text-brand-600" /> Add a clinical photograph
        </p>
        {results === null && staged.length === 0 && (
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/heic,image/heif,image/webp"
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
          Photo uploads need a connection. Reconnect to attach images — queued clinical notes are unaffected.
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
              <ImageIcon size={16} className="text-brand-600" />
              <span className="text-xs font-bold text-ink-700">Choose photos</span>
              <span className="text-[11px] text-ink-400">JPG, PNG, HEIC or WEBP · up to 5 photos · 10 MB each</span>
            </button>
          )}

          {staged.length > 0 && (
            <>
              <div className="mt-3">
                <label htmlFor="visual-type" className="mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-500">
                  Optional: what does this photo show?
                </label>
                <select
                  id="visual-type"
                  value={declaredType}
                  onChange={(e) => setDeclaredType(e.target.value)}
                  className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs text-ink-700 outline-none focus:border-brand-500"
                >
                  <option value="">Let the system infer it</option>
                  {DECLARED_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {VISUAL_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
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
            </>
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
                  {uploading ? 'Redacting & analysing…' : `Upload ${staged.length} photo(s)`}
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
            {results.length} photo(s) redacted and stored — descriptions await doctor verification.
          </p>
          {results.map((r) => (
            <VisualPreview key={r.visual.id} visual={r.visual} />
          ))}
          <button
            type="button"
            onClick={() => setResults(null)}
            className="text-[11px] font-bold text-brand-700 hover:text-brand-900"
          >
            Upload another photo
          </button>
        </div>
      )}
    </div>
  )
}
