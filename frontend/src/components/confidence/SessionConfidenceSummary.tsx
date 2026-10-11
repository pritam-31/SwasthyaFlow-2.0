import { useEffect } from 'react'
import { Gauge, RefreshCw, TriangleAlert } from 'lucide-react'
import { Button, Card, InfoBanner } from '../ui'
import ConfidenceBadge from './ConfidenceBadge'
import ConfidenceExplanationCard from './ConfidenceExplanationCard'
import LowConfidencePanel from './LowConfidencePanel'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONFIDENCE_SECTION_LABELS } from '../../services/safetyPolicy'
import type { PatientSession } from '../../types/triage'

/**
 * Per-case confidence: the aggregate, the weakest contributing signal and every
 * output under the facility's low threshold, each with its explanation and a
 * human review action. Confidence is a workflow label about extraction
 * reliability — never a diagnosis.
 */
export function SessionConfidenceSummary({ session }: { session: PatientSession }) {
  const { permissions, confidencesBySession, confidenceLoading, refreshSessionConfidence, recomputeSessionConfidence } =
    useTriage()
  const code = CODE_BY_INTAKE_LANGUAGE[session.raw.language]
  const labels = CONFIDENCE_SECTION_LABELS[code]
  const confidence = confidencesBySession[session.id]
  const loading = confidenceLoading[session.id] ?? false

  useEffect(() => {
    if (!permissions.canViewConfidence) return
    void refreshSessionConfidence(session.id)
  }, [permissions.canViewConfidence, refreshSessionConfidence, session.id])

  if (!permissions.canViewConfidence) return null

  const canRecompute = permissions.canRecomputeConfidence
  const offline = typeof navigator !== 'undefined' && !navigator.onLine

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Gauge size={15} className="text-brand-600" /> {labels.title}
        </span>
      }
      subtitle={labels.subtitle}
      action={
        <Button
          variant="ghost"
          size="sm"
          disabled={loading || !canRecompute}
          title={canRecompute ? labels.recompute : undefined}
          onClick={() => void recomputeSessionConfidence(session.id)}
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : undefined} /> {loading ? labels.recomputing : labels.recompute}
        </Button>
      }
    >
      {confidence ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="rounded-xl border border-ink-200 bg-white p-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">
                {labels.aggregateScore}
              </p>
              <ConfidenceExplanationCard score={confidence.aggregate} labels={labels} />
            </div>
            <div className="rounded-xl border border-ink-200 bg-white p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-500">{labels.worstScore}</p>
                <ConfidenceBadge band={confidence.worst.band} value={confidence.worst.value} label={labels.bands[confidence.worst.band]} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-ink-700">
                <TriangleAlert size={13} className="text-amber-500" />
                {labels.limitingFactor}: <span className="font-normal text-ink-500">{confidence.limitingFactor}</span>
              </p>
              <p className="mt-1.5 text-[11.5px] text-ink-600">{confidence.worst.explanation.summary}</p>
            </div>
          </div>

          <div className="border-t border-ink-100 pt-3">
            <LowConfidencePanel sessionId={session.id} confidence={confidence} labels={labels} />
          </div>
        </div>
      ) : (
        <InfoBanner>
          {offline ? labels.offline : labels.loadFailed}
        </InfoBanner>
      )}
    </Card>
  )
}

export default SessionConfidenceSummary
