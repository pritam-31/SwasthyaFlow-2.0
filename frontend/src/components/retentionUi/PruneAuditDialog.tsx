import { useState } from 'react'
import { Scissors } from 'lucide-react'
import { Badge, Button, Modal } from '../ui'
import { useApp } from '../../store/AppStore'
import { pruneAuditRange } from '../../services/retentionUiApi'
import type { PruneAuditResult } from '../../types/retentionUi.types'

function localInputValue(daysAgo: number): string {
  const d = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function PruneAuditDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const { pushToast } = useApp()
  const [before, setBefore] = useState(localInputValue(90))
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<PruneAuditResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (!window.confirm('Prune audit entries before this instant? The hash chain is preserved.')) return
    setBusy(true)
    setError(null)
    try {
      const res = await pruneAuditRange(new Date(before).toISOString())
      setResult(res)
      pushToast('success', `Pruned ${res.pruned} entr${res.pruned === 1 ? 'y' : 'ies'}.`)
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The prune failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Prune audit log">
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-xl bg-rose-50 px-3 py-2 text-[11px] text-rose-800 ring-1 ring-rose-200">
          <Scissors size={14} className="mt-0.5 shrink-0" />
          Audit entries are never hard-deleted — pruning removes payloads but keeps the hash chain verifiable. This is system-admin only.
        </p>

        <label className="block text-xs font-semibold text-ink-600">
          Prune entries older than
          <input
            type="datetime-local"
            value={before}
            onChange={(e) => setBefore(e.target.value)}
            className="mt-1 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-xs font-normal text-ink-800"
          />
        </label>

        {error && <p className="text-[11px] text-rose-600">{error}</p>}

        {result && (
          <div className="space-y-1 rounded-xl border border-ink-100 p-3 text-[11px] text-ink-600">
            <p>Cut-off: {new Date(result.before).toLocaleString('en-IN')}</p>
            <p>
              Pruned <strong className="text-ink-800">{result.pruned}</strong> · remaining <strong className="text-ink-800">{result.remaining}</strong>
            </p>
            <Badge
              className={result.chainIntact ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-rose-50 text-rose-700 ring-rose-200'}
            >
              {result.chainIntact ? 'Chain intact' : 'Chain broken'}
            </Badge>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </Button>
          <Button variant="danger" onClick={submit} disabled={busy || !before}>
            {busy ? 'Pruning…' : 'Prune'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
