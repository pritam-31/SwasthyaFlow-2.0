/**
 * Follow-up question list card (P0-5).
 *
 * The context-aware, per-language question surface. Auto-fetches the session's
 * follow-up questions on mount; staff with the right permissions get
 * generate / regenerate, add-a-question, ask / answer / skip, edit, delete and
 * reorder controls. `readOnly` renders the patient's own targeted questions
 * only, with no actions (used on patient-facing surfaces).
 *
 * Questions, reasons and answers are rendered verbatim from the backend and are
 * never passed through the non-diagnostic sanitizer.
 */

import { useEffect, useState } from 'react'
import { ListPlus, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Badge, Button, Card, EmptyState, Skeleton } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { FOLLOW_UP_SECTION_LABELS } from '../../services/safetyPolicy'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import type { PatientSession } from '../../types/triage'
import FollowUpCard from './FollowUpCard'
import ClinicianQuestionForm from './ClinicianQuestionForm'

export default function FollowUpList({
  session,
  readOnly = false,
  compact = false,
}: {
  session: PatientSession
  /** Hide every staff action (patient-facing surfaces). */
  readOnly?: boolean
  /** Compact presentation — title + items only, no header actions. */
  compact?: boolean
}) {
  const {
    followUpsBySession,
    followUpLoading,
    permissions,
    refreshSessionFollowUps,
    generateSessionFollowUps,
    regenerateSessionFollowUps,
    reorderSessionFollowUps,
  } = useTriage()

  const followUps = followUpsBySession[session.id]
  const questions = followUps ?? []
  const loading = followUpLoading[session.id] ?? false
  const [addOpen, setAddOpen] = useState(false)
  const [busy, setBusy] = useState<'generate' | 'regenerate' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (followUps === undefined && !loading) {
      refreshSessionFollowUps(session.id)
    }
  }, [followUps, loading, refreshSessionFollowUps, session.id])

  // Only staff who can put questions to the patient see the full list; anyone
  // else sees just the questions targeted at the patient themselves.
  const viewerCanTrack = !readOnly && (permissions.canAskFollowUp || permissions.canEditFollowUps)
  const visible = viewerCanTrack ? questions : questions.filter((q) => q.target === 'patient')
  const sorted = [...visible].sort((a, b) => a.priority - b.priority)
  const staff = !readOnly && permissions.canGenerateFollowUps

  const run = async (action: 'generate' | 'regenerate') => {
    setBusy(action)
    setNotice(null)
    const result =
      action === 'generate'
        ? await generateSessionFollowUps(session.id)
        : await regenerateSessionFollowUps(session.id)
    setBusy(null)
    setNotice(
      result
        ? action === 'generate'
          ? 'Questions generated from the session context — a human tracks each one before it is asked.'
          : 'Questions regenerated — previous suggestions were replaced, the human-tracked ones kept.'
        : 'Your role cannot do this, or the backend rejected it.',
    )
  }

  const move = async (questionId: string, direction: 'up' | 'down') => {
    const index = sorted.findIndex((q) => q.id === questionId)
    if (index < 0) return
    const next = sorted.map((q) => q.id)
    const swapIndex = direction === 'up' ? index - 1 : index + 1
    if (swapIndex < 0 || swapIndex >= next.length) return
    ;[next[index], next[swapIndex]] = [next[swapIndex], next[index]]
    const ok = await reorderSessionFollowUps(session.id, next)
    setNotice(ok ? 'Question order saved.' : 'Reordering failed — your role cannot reorder questions.')
  }

  const questionLanguage = sorted[0]?.language ?? 'en'
  const labels = FOLLOW_UP_SECTION_LABELS[questionLanguage] ?? FOLLOW_UP_SECTION_LABELS.en

  return (
    <Card
      id={`followups-${session.id}`}
      title={labels.title}
      subtitle={labels.subtitle}
      action={
        staff ? (
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run('regenerate')}>
              {busy === 'regenerate' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
              {labels.regenerate}
            </Button>
            {permissions.canAddClinicianFollowUp && (
              <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
                <ListPlus size={13} /> {labels.addQuestion}
              </Button>
            )}
          </div>
        ) : (
          sorted.length > 0 && (
            <Badge className="bg-white text-ink-500 ring-ink-200">
              {LANGUAGE_NATIVE_LABEL[sorted[0].language]} · {sorted.length}
            </Badge>
          )
        )
      }
    >
      {loading && sorted.length === 0 ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-xl" />
          <Skeleton className="h-10 w-11/12 rounded-xl" />
          <Skeleton className="h-10 w-2/3 rounded-xl" />
        </div>
      ) : sorted.length === 0 ? (
        <EmptyState icon={<Sparkles size={20} />} title={labels.empty} hint={staff ? labels.generate : labels.emptyHint} />
      ) : (
        <div className="space-y-2.5">
          {notice && (
            <p role="status" className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
              {notice}
            </p>
          )}
          <ul className="space-y-2.5">
            {sorted.map((q, i) => (
              <FollowUpCard
                key={q.id}
                sessionId={session.id}
                question={q}
                readOnly={readOnly}
                canMoveUp={!readOnly && permissions.canEditFollowUps && i > 0}
                canMoveDown={!readOnly && permissions.canEditFollowUps && i < sorted.length - 1}
                onMove={(direction) => move(q.id, direction)}
              />
            ))}
          </ul>
          {staff && !compact && (
            <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run('generate')}>
              {busy === 'generate' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {labels.generate}
            </Button>
          )}
          <p className="text-[10px] leading-relaxed text-ink-400">{labels.neverAsks}</p>
        </div>
      )}

      {staff && permissions.canAddClinicianFollowUp && (
        <ClinicianQuestionForm session={session} open={addOpen} onClose={() => setAddOpen(false)} />
      )}
    </Card>
  )
}