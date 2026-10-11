import { Search, SlidersHorizontal } from 'lucide-react'
import { Button } from '../ui'
import type { AuditSectionLabels } from '../../services/safetyPolicy'
import type { AuditCategory, UserRole } from '../../types/triage'
import type { AuditFilter } from '../../types/auditChain.types'

const CATEGORIES: AuditCategory[] = ['view', 'edit', 'decision', 'export', 'auth', 'system']
const ROLES: UserRole[] = ['patient', 'nurse', 'doctor', 'admin', 'system-admin', 'facility-admin']

interface Props {
  labels: AuditSectionLabels
  value: AuditFilter
  onChange: (next: AuditFilter) => void
  onApply: () => void
  onReset: () => void
}

/** Filter controls for the chained audit trail (search + structured filters). */
export function AuditFilterBar({ labels, value, onChange, onApply, onReset }: Props) {
  const set = (patch: Partial<AuditFilter>): void => onChange({ ...value, ...patch, cursor: undefined })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-500">
        <SlidersHorizontal size={14} /> {labels.filterTitle}
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="relative block">
          <span className="sr-only">{labels.search}</span>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-400" />
          <input
            value={value.search ?? ''}
            onChange={(e) => set({ search: e.target.value || undefined })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onApply()
            }}
            placeholder={labels.searchPlaceholder}
            className="inp pl-9"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-ink-400">{labels.category}</span>
          <select
            value={value.categories?.[0] ?? ''}
            onChange={(e) => set({ categories: e.target.value ? [e.target.value as AuditCategory] : undefined })}
            className="inp"
          >
            <option value="">{labels.all}</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-ink-400">{labels.role}</span>
          <select
            value={value.actorRoles?.[0] ?? ''}
            onChange={(e) => set({ actorRoles: e.target.value ? [e.target.value as UserRole] : undefined })}
            className="inp"
          >
            <option value="">{labels.all}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-ink-400">{labels.action}</span>
          <input
            value={value.actions?.[0] ?? ''}
            onChange={(e) => set({ actions: e.target.value ? [e.target.value] : undefined })}
            placeholder="case.viewed"
            className="inp"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-ink-400">{labels.since}</span>
          <input
            type="date"
            value={value.since?.slice(0, 10) ?? ''}
            onChange={(e) => set({ since: e.target.value ? `${e.target.value}T00:00:00.000Z` : undefined })}
            className="inp"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-ink-400">{labels.until}</span>
          <input
            type="date"
            value={value.until?.slice(0, 10) ?? ''}
            onChange={(e) => set({ until: e.target.value ? `${e.target.value}T23:59:59.999Z` : undefined })}
            className="inp"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[11px] font-semibold text-ink-500">
          {labels.sort}
          <select
            value={value.sort ?? 'desc'}
            onChange={(e) => set({ sort: e.target.value === 'asc' ? 'asc' : 'desc' })}
            className="inp py-1"
          >
            <option value="desc">{labels.newestFirst}</option>
            <option value="asc">{labels.oldestFirst}</option>
          </select>
        </label>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onReset}>
            {labels.reset}
          </Button>
          <Button size="sm" onClick={onApply}>
            {labels.apply}
          </Button>
        </div>
      </div>
    </div>
  )
}
