import { useEffect, useMemo, useState } from 'react'
import { RotateCcw, Save } from 'lucide-react'
import { Button } from '../ui'
import type { RetentionPolicy, RetentionRule } from '../../types/retention.types'
import type { RetentionRulePatch } from '../../services/retentionApi'

interface DraftRow {
  retentionDays: number
  enabled: boolean
}

/**
 * Admin-only editor for the retention policy. Rule days may be 0 only for the
 * flagged "zero-day" categories (backend-enforced); toggling `enabled` off
 * keeps a category forever. Partial rule patches are sent (only what changed).
 */
export default function RetentionPolicyEditor({
  policy,
  saving,
  onSave,
}: {
  policy: RetentionPolicy
  saving: boolean
  onSave: (rules: RetentionRulePatch[]) => Promise<boolean>
}) {
  const [draft, setDraft] = useState<Record<string, DraftRow>>({})

  useEffect(() => {
    const next: Record<string, DraftRow> = {}
    for (const rule of policy.rules) next[rule.category] = { retentionDays: rule.retentionDays, enabled: rule.enabled }
    setDraft(next)
  }, [policy])

  const patches = useMemo<RetentionRulePatch[]>(() => {
    const out: RetentionRulePatch[] = []
    for (const rule of policy.rules) {
      const row = draft[rule.category]
      if (!row) continue
      if (row.retentionDays !== rule.retentionDays || row.enabled !== rule.enabled) {
        out.push({ category: rule.category, retentionDays: row.retentionDays, enabled: row.enabled })
      }
    }
    return out
  }, [draft, policy.rules])

  const update = (rule: RetentionRule, patch: Partial<DraftRow>) => {
    setDraft((prev) => ({
      ...prev,
      [rule.category]: { ...(prev[rule.category] ?? { retentionDays: rule.retentionDays, enabled: rule.enabled }), ...patch },
    }))
  }

  const reset = () => {
    const next: Record<string, DraftRow> = {}
    for (const rule of policy.rules) next[rule.category] = { retentionDays: rule.retentionDays, enabled: rule.enabled }
    setDraft(next)
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="sf-table min-w-[620px]">
          <thead>
            <tr>
              <th>Category</th>
              <th>Retention (days)</th>
              <th>Enabled</th>
            </tr>
          </thead>
          <tbody>
            {policy.rules.map((rule) => {
              const row = draft[rule.category] ?? { retentionDays: rule.retentionDays, enabled: rule.enabled }
              return (
                <tr key={rule.category}>
                  <td>
                    <p className="font-semibold text-ink-700">{rule.label}</p>
                    <p className="text-[10px] text-ink-400">{rule.description}</p>
                  </td>
                  <td>
                    <input
                      type="number"
                      min={0}
                      max={3650}
                      value={row.retentionDays}
                      onChange={(e) => update(rule, { retentionDays: Number(e.target.value) })}
                      className="w-24 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs text-ink-700 outline-none focus:border-brand-500"
                      aria-label={`${rule.label} retention days`}
                    />
                  </td>
                  <td>
                    <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-ink-600">
                      <input
                        type="checkbox"
                        checked={row.enabled}
                        onChange={(e) => update(rule, { enabled: e.target.checked })}
                        className="h-4 w-4 accent-[#1f7d6b]"
                        aria-label={`${rule.label} enabled`}
                      />
                      {row.enabled ? 'Enabled' : 'Keep forever'}
                    </label>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={reset} disabled={saving || patches.length === 0}>
          <RotateCcw size={14} /> Reset
        </Button>
        <Button size="sm" onClick={() => onSave(patches)} disabled={saving || patches.length === 0}>
          <Save size={14} /> Save {patches.length > 0 ? `(${patches.length})` : ''}
        </Button>
      </div>
    </div>
  )
}
