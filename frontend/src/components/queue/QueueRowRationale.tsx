/** Compact one-line rationale for a queue row (P2-18-L). */

import { Badge } from '../ui'
import type { RiskScore } from '../../types/triage'

const RISK_META: Record<RiskScore, { label: string; classes: string; dot: string; rank: number }> = {
  High: { label: 'High priority', classes: 'bg-rose-50 text-rose-700 ring-rose-200', dot: 'bg-rose-500', rank: 0 },
  Medium: { label: 'Medium priority', classes: 'bg-amber-50 text-amber-700 ring-amber-200', dot: 'bg-amber-500', rank: 1 },
  Low: { label: 'Low priority', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200', dot: 'bg-emerald-500', rank: 2 },
}

function priorityComponentClasses(priority: RiskScore): string {
  return RISK_META[priority].classes
}

interface QueueRowRationaleProps {
  risk: RiskScore
  overrides: Array<{ field: string; previousValue: string; newValue: string }>
  slaBreached: boolean
}

export function QueueRowRationale({
  risk,
  overrides,
  slaBreached,
}: QueueRowRationaleProps) {
  const topComponents: Array<{ label: string; classes: string }> = []

  // Risk score component
  topComponents.push({
    label: RISK_META[risk]?.label ?? 'Low priority',
    classes: priorityComponentClasses(risk),
  })

  // Override chip if overrides exist
  if (overrides && overrides.length > 0) {
    topComponents.push({
      label: 'Override',
      classes: 'bg-violet-50 text-violet-700 ring-violet-200',
    })
  }

  // SLA breached chip
  if (slaBreached) {
    topComponents.push({
      label: 'SLA breached',
      classes: 'bg-rose-50 text-rose-700 ring-rose-200',
    })
  }

  return (
    <span className="flex items-center gap-1.5">
      {topComponents.map((comp, i) => (
        <Badge key={i} className={comp.classes}>
          {comp.label}
        </Badge>
      ))}
    </span>
  )
}