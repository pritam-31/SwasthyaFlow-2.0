import { Badge } from '../ui'
import { FAILURE_MODE_SECTION_LABELS } from '../../services/safetyPolicy'
import type { FailureImpact, FailureLikelihood, FailureStatus } from '../../types/modelcard.types'

type Lang = 'en' | 'hi' | 'or'

const IMPACT_TONE: Record<FailureImpact, string> = {
  high: 'bg-rose-50 text-rose-700 ring-rose-200',
  medium: 'bg-amber-50 text-amber-700 ring-amber-200',
  low: 'bg-sky-50 text-sky-700 ring-sky-200',
}

const LIKELIHOOD_TONE: Record<FailureLikelihood, string> = {
  rare: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  uncommon: 'bg-amber-50 text-amber-700 ring-amber-200',
  common: 'bg-rose-50 text-rose-700 ring-rose-200',
}

const STATUS_TONE: Record<FailureStatus, string> = {
  open: 'bg-rose-50 text-rose-700 ring-rose-200',
  mitigated: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  accepted: 'bg-sky-50 text-sky-700 ring-sky-200',
}

/** Compact label for a failure-mode impact / likelihood / status value. */
export function FailureModeBadge({
  kind,
  value,
  lang = 'en',
}: {
  kind: 'impact' | 'likelihood' | 'status'
  value: FailureImpact | FailureLikelihood | FailureStatus
  lang?: Lang
}) {
  const t = FAILURE_MODE_SECTION_LABELS[lang]
  if (kind === 'impact') {
    const v = value as FailureImpact
    const label = v === 'high' ? t.impactHigh : v === 'medium' ? t.impactMedium : t.impactLow
    return <Badge className={IMPACT_TONE[v]}>{label}</Badge>
  }
  if (kind === 'likelihood') {
    const v = value as FailureLikelihood
    const label = v === 'rare' ? t.likelihoodRare : v === 'uncommon' ? t.likelihoodUncommon : t.likelihoodCommon
    return <Badge className={LIKELIHOOD_TONE[v]}>{label}</Badge>
  }
  const v = value as FailureStatus
  const label = v === 'open' ? t.statusOpen : v === 'mitigated' ? t.statusMitigated : t.statusAccepted
  return <Badge className={STATUS_TONE[v]}>{label}</Badge>
}
