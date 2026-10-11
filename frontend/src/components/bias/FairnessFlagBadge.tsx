import { Badge } from '../ui'
import { FAIRNESS_FLAG_LABELS } from '../../services/safetyPolicy'
import type { FairnessFlag } from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

const TONE: Record<FairnessFlag, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  amber: 'bg-amber-50 text-amber-700 ring-amber-200',
  red: 'bg-rose-50 text-rose-700 ring-rose-200',
}

/**
 * Fairness flag chip. A flag always reads "review before relying on this layer
 * for that group" — never "broken". The interpretation is also in the tooltip.
 */
export function FairnessFlagBadge({ flag, lang = 'en' }: { flag: FairnessFlag; lang?: Lang }) {
  const t = FAIRNESS_FLAG_LABELS[lang]
  const label = flag === 'green' ? t.green : flag === 'amber' ? t.amber : t.red
  const tooltip = flag === 'green' ? t.greenTooltip : flag === 'amber' ? t.amberTooltip : t.redTooltip
  return (
    <span title={tooltip}>
      <Badge className={TONE[flag]}>{label}</Badge>
    </span>
  )
}
