import { useState } from 'react'
import { Play } from 'lucide-react'
import { Button } from '../ui'
import type { RetentionJobResult, RetentionMode } from '../../types/retention.types'

/**
 * Admin control to run a retention sweep on demand. `delete` erases due data;
 * `anonymise` keeps record shapes with their content stripped. The scheduled
 * sweep runs the same engine.
 */
export default function RetentionRunButton({
  running,
  onRun,
}: {
  running: boolean
  onRun: (mode: RetentionMode) => Promise<RetentionJobResult | null>
}) {
  const [mode, setMode] = useState<RetentionMode>('delete')
  const [last, setLast] = useState<RetentionJobResult | null>(null)

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="retention-mode" className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
          Mode
        </label>
        <select
          id="retention-mode"
          value={mode}
          onChange={(e) => setMode(e.target.value as RetentionMode)}
          className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-500"
        >
          <option value="delete">Delete due data</option>
          <option value="anonymise">Anonymise due data</option>
        </select>
        <Button
          size="sm"
          onClick={async () => {
            const result = await onRun(mode)
            if (result) setLast(result)
          }}
          disabled={running}
        >
          <Play size={14} /> {running ? 'Running…' : 'Run sweep now'}
        </Button>
      </div>
      {last && (
        <p className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
          Last sweep: <strong>{last.totalDeleted}</strong> record(s) processed in {last.durationMs} ms (
          {last.mode}) · {last.byCategory.filter((c) => c.deleted > 0).length} categor(y/ies) affected.
        </p>
      )}
    </div>
  )
}
