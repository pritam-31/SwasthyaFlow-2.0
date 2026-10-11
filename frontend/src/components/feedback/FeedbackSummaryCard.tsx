import { useEffect, useMemo, useState } from 'react'
import { MessageSquarePlus, MessagesSquare } from 'lucide-react'
import { Button, Card, EmptyState } from '../ui'
import FeedbackList from './FeedbackList'
import FeedbackForm from './FeedbackForm'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { FEEDBACK_SECTION_LABELS } from '../../services/safetyPolicy'
import type { FeedbackTargetPreset } from './FeedbackForm'
import type { PatientSession } from '../../types/triage'

/**
 * Per-case clinician feedback: the verdicts recorded against this case's AI
 * outputs, with an action to add one. Feedback is workflow-quality evidence
 * only and never auto-applies to a rule, threshold or score.
 */
export function FeedbackSummaryCard({ session }: { session: PatientSession }) {
  const { permissions, feedbackBySession, feedbackLoading, refreshSessionFeedback, submitFeedback } = useTriage()
  const labels = FEEDBACK_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[session.raw.language]]
  const items = feedbackBySession[session.id] ?? []
  const loading = feedbackLoading[session.id] ?? false
  const [adding, setAdding] = useState(false)
  const preset = useMemo<FeedbackTargetPreset>(
    () => ({ targetType: 'triage-note', targetId: session.id, targetLabel: session.patientId }),
    [session.id, session.patientId],
  )

  useEffect(() => {
    if (!permissions.canViewFeedback) return
    void refreshSessionFeedback(session.id)
  }, [permissions.canViewFeedback, refreshSessionFeedback, session.id])

  if (!permissions.canViewFeedback) return null

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <MessagesSquare size={15} className="text-brand-600" /> {labels.title}
        </span>
      }
      subtitle={labels.subtitle}
      action={
        permissions.canSubmitFeedback ? (
          <Button variant="secondary" size="sm" disabled={loading} onClick={() => setAdding(true)}>
            <MessageSquarePlus size={14} /> {labels.addFeedback}
          </Button>
        ) : undefined
      }
    >
      {items.length === 0 ? (
        <EmptyState icon={<MessagesSquare size={18} />} title={labels.emptySession} hint={labels.nonDiagnostic} />
      ) : (
        <FeedbackList items={items} labels={labels} />
      )}

      <FeedbackForm
        open={adding}
        labels={labels}
        sessionId={session.id}
        preset={preset}
        editing={null}
        onSubmit={submitFeedback}
        onUpdate={async () => false}
        onClose={() => setAdding(false)}
      />
    </Card>
  )
}

export default FeedbackSummaryCard
