import { Badge } from '../ui'
import type { RetentionPolicy } from '../../types/retention.types'

const SCOPE_LABEL: Record<string, string> = {
  session: 'Per-case',
  account: 'Account',
  system: 'System',
  file: 'File',
}

/**
 * Read-only view of the published retention policy. Doctors and admins may
 * read it; only admins edit it (see RetentionPolicyEditor).
 */
export default function RetentionPolicyTable({ policy }: { policy: RetentionPolicy }) {
  return (
    <div className="overflow-x-auto">
      <table className="sf-table min-w-[560px]">
        <thead>
          <tr>
            <th>Category</th>
            <th>Scope</th>
            <th>Retention</th>
            <th>State</th>
          </tr>
        </thead>
        <tbody>
          {policy.rules.map((rule) => (
            <tr key={rule.category}>
              <td>
                <p className="font-semibold text-ink-700">{rule.label}</p>
                <p className="font-mono text-[10px] text-ink-400">{rule.category}</p>
              </td>
              <td className="text-xs text-ink-500">{SCOPE_LABEL[rule.scope] ?? rule.scope}</td>
              <td className="text-xs font-semibold text-ink-700">
                {rule.retentionDays === 0 ? 'Immediately on next sweep' : `${rule.retentionDays} days`}
              </td>
              <td>
                <Badge
                  className={
                    rule.enabled
                      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                      : 'bg-ink-100 text-ink-500 ring-ink-200'
                  }
                >
                  {rule.enabled ? 'Enabled' : 'Kept forever'}
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
