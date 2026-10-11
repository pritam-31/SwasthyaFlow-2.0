import { AlertTriangle } from 'lucide-react'
import type { QueuedItem } from '../../types/sync.types'
import { useOffline } from '../../context/OfflineContext'
import { OFFLINE_SECTION_LABELS } from '../../services/safetyPolicy'

type OfflineLang = 'en' | 'hi' | 'or'

function renderValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

/**
 * Explicit human resolution of a sync conflict. The system never picks a
 * winner on its own — this is the human-in-the-loop boundary for offline edits.
 */
export function ConflictResolver({ item, lang = 'en' }: { item: QueuedItem; lang?: OfflineLang }) {
  const { resolveConflict } = useOffline()
  const copy = OFFLINE_SECTION_LABELS[lang]
  const fields = item.conflictInfo?.fields ?? []

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
      <div className="flex items-center gap-2 text-[12px] font-bold text-amber-800">
        <AlertTriangle size={14} />
        {copy.conflictTitle}
      </div>
      <p className="mt-1 text-[11px] text-amber-700">{copy.conflictBody}</p>

      {fields.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {fields.map((f) => (
            <li key={f.name} className="rounded-lg bg-white/70 p-2 text-[11px]">
              <p className="font-bold text-ink-700">{f.name}</p>
              <p className="text-ink-500">
                <span className="font-semibold text-ink-600">{copy.yourVersion}:</span> {renderValue(f.clientValue)}
              </p>
              <p className="text-ink-500">
                <span className="font-semibold text-ink-600">{copy.serverVersion}:</span> {renderValue(f.serverValue)}
              </p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void resolveConflict(item.id, 'keep-mine')}
          className="rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-brand-700"
        >
          {copy.keepMine}
        </button>
        <button
          type="button"
          onClick={() => void resolveConflict(item.id, 'keep-server')}
          className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-ink-700 hover:bg-ink-50"
        >
          {copy.keepServer}
        </button>
        <button
          type="button"
          onClick={() => void resolveConflict(item.id, 'abandon')}
          className="rounded-lg border border-amber-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-amber-700 hover:bg-amber-50"
        >
          {copy.abandon}
        </button>
      </div>
    </div>
  )
}
