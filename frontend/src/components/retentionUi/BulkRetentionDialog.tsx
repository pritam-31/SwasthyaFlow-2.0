import { useState } from 'react'
import { Layers } from 'lucide-react'
import { Button, Modal } from '../ui'
import { useApp } from '../../store/AppStore'
import { RETENTION_CATEGORIES } from '../../services/retentionApi'
import { runBulkRetention } from '../../services/retentionUiApi'
import type { BulkRetentionAction, BulkRetentionResult } from '../../types/retentionUi.types'
import type { RetentionCategory } from '../../types/retention.types'

const ACTIONS: { value: BulkRetentionAction; label: string }[] = [
  { value: 'run-now', label: 'Run retention now' },
  { value: 'export', label: 'Export' },
  { value: 'extend', label: 'Extend retention' },
  { value: 'anonymise', label: 'Anonymise' },
  { value: 'soft-delete', label: 'Soft delete' },
]

export function BulkRetentionDialog({
  open,
  onClose,
  sessionIds,
  onDone,
}: {
  open: boolean
  onClose: () => void
  sessionIds: string[]
  onDone: () => void
}) {
  const { pushToast } = useApp()
  const [action, setAction] = useState<BulkRetentionAction>('run-now')
  const [category, setCategory] = useState<RetentionCategory | 'all'>('all')
  const [extraDays, setExtraDays] = useState('30')
  const [targets, setTargets] = useState(sessionIds.join('\n'))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<BulkRetentionResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const parsed = targets
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean)
  const canSubmit = parsed.length > 0 && !busy

  async function submit() {
    if (!canSubmit) return
    if (action === 'soft-delete' && !window.confirm('Soft-delete these cases? This is audited and reversible only from a backup.')) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const res = await runBulkRetention({
        action,
        category,
        sessionIds: parsed,
        extraDays: action === 'extend' ? Number(extraDays) : undefined,
      })
      setResult(res)
      pushToast('success', `Bulk ${action} finished — ${res.affected} affected, ${res.skipped} skipped.`)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The bulk run failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Run bulk retention" wide>
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 ring-1 ring-amber-200">
          <Layers size={14} className="mt-0.5 shrink-0" />
          Bulk actions are audited and never diagnose. Every session you act on is picked from this facility only.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold text-ink-600">
            Action
            <select
              value={action}
              onChange={(e) => setAction(e.target.value as BulkRetentionAction)}
              className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-xs font-normal text-ink-800"
            >
              {ACTIONS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-ink-600">
            Category
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as RetentionCategory | 'all')}
              className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-xs font-normal text-ink-800"
            >
              <option value="all">All categories</option>
              {RETENTION_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          {action === 'extend' && (
            <label className="text-xs font-semibold text-ink-600">
              Extra days (1–365)
              <input
                type="number"
                min={1}
                max={365}
                value={extraDays}
                onChange={(e) => setExtraDays(e.target.value)}
                className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-xs font-normal text-ink-800"
              />
            </label>
          )}
        </div>

        <label className="block text-xs font-semibold text-ink-600">
          Sessions ({parsed.length})
          <textarea
            value={targets}
            onChange={(e) => setTargets(e.target.value)}
            rows={5}
            placeholder="One session id per line"
            className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-1.5 font-mono text-[11px] font-normal text-ink-800"
          />
        </label>

        {error && <p className="text-[11px] text-rose-600">{error}</p>}

        {result && (
          <div className="max-h-48 overflow-auto rounded-xl border border-ink-100 p-3">
            <p className="mb-1 text-[11px] font-semibold text-ink-700">
              Result — affected {result.affected}, skipped {result.skipped}, requested {result.requested}
            </p>
            <ul className="space-y-0.5 text-[11px] text-ink-500">
              {result.details.map((d) => (
                <li key={d.sessionId} className="flex gap-2">
                  <span
                    className={
                      d.status === 'ok' ? 'text-emerald-600' : d.status === 'skipped' ? 'text-amber-600' : 'text-rose-600'
                    }
                  >
                    {d.status}
                  </span>
                  <span className="font-mono">{d.sessionId}</span>
                  <span className="truncate">{d.message}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="primary" onClick={submit} disabled={!canSubmit}>
            {busy ? 'Running…' : `Run ${action}`}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
