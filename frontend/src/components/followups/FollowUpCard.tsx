/**
 * A single follow-up question card (P0-5).
 *
 * Renders the question verbatim from the backend (it is never passed through
 * the non-diagnostic sanitizer), with its language-aware routing labels, the
 * reasoning that triggered it, and the human-in-the-loop lifecycle actions:
 * ask → answer/skip, plus clinician edits and deletion. `readOnly` hides every
 * staff action (patient-facing surfaces).
 *
 * Hard guard, enforced server-side: questions never request names, phones,
 * addresses or IDs, and never ask for a diagnosis / prescription.
 */

import { useState } from 'react'
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  MessageCircleQuestion,
  Pencil,
  Trash2,
  X,
} from 'lucide-react'
import { Badge, Button, cx } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { FOLLOW_UP_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import {
  FOLLOW_UP_CATEGORY_LABELS,
  FOLLOW_UP_SOURCE_LABELS,
  FOLLOW_UP_STATUS_LABELS,
  FOLLOW_UP_TARGET_LABELS,
} from '../../types/followup.types'
import type { FollowUpQuestion } from '../../types/followup.types'
import FollowUpAnswerInput from './FollowUpAnswerInput'

const STATUS_CLASSES: Record<FollowUpQuestion['status'], string> = {
  suggested: 'bg-ink-100 text-ink-600 ring-ink-200',
  asked: 'bg-sky-50 text-sky-700 ring-sky-200',
  answered: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  skipped: 'bg-ink-50 text-ink-400 ring-ink-200',
}

const TARGET_CLASSES: Record<FollowUpQuestion['target'], string> = {
  patient: 'bg-brand-50 text-brand-700 ring-brand-200',
  staff: 'bg-violet-50 text-violet-700 ring-violet-200',
}

export default function FollowUpCard({
  sessionId,
  question,
  readOnly = false,
  canMoveDown,
  canMoveUp,
  onMove,
}: {
  sessionId: string
  question: FollowUpQuestion
  /** Hide every staff action (patient-facing surfaces). */
  readOnly?: boolean
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (direction: 'up' | 'down') => void
}) {
  const {
    permissions,
    askFollowUp,
    answerFollowUpInLanguage,
    skipSessionFollowUp,
    editSessionFollowUp,
    deleteSessionFollowUp,
  } = useTriage()

  const labels = FOLLOW_UP_SECTION_LABELS[question.language] ?? FOLLOW_UP_SECTION_LABELS.en
  const statusLabel = FOLLOW_UP_STATUS_LABELS[question.language][question.status]
  const categoryLabel = FOLLOW_UP_CATEGORY_LABELS[question.language][question.category]
  const sourceLabel = FOLLOW_UP_SOURCE_LABELS[question.language][question.sourceType]
  const targetLabel = FOLLOW_UP_TARGET_LABELS[question.language][question.target]

  const [answering, setAnswering] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(question.question)
  const [notice, setNotice] = useState<string | null>(null)

  const staff = !readOnly && (permissions.canAskFollowUp || permissions.canEditFollowUps || permissions.canDeleteFollowUps)
  if (!staff && question.target === 'staff') return null

  const confirmDelete = async () => {
    if (!window.confirm('Delete this follow-up question?')) return
    const ok = await deleteSessionFollowUp(sessionId, question.id)
    setNotice(ok ? 'Question deleted.' : 'Your role cannot delete questions.')
  }

  const saveEdit = async () => {
    const text = draft.trim()
    if (!text || text === question.question) {
      setEditing(false)
      setNotice('Text unchanged — keeping the original wording.')
      return
    }
    const ok = await editSessionFollowUp(sessionId, question.id, { question: text })
    setEditing(false)
    setNotice(ok ? 'Question updated — the change is in the audit trail.' : 'Your role cannot edit questions.')
  }

  return (
    <li
      className={cx(
        'rounded-xl border border-ink-200 bg-white p-3.5',
        question.status === 'answered' && 'border-emerald-200/70',
        question.target === 'staff' && 'border-violet-200/70',
      )}
    >
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-relaxed text-ink-800">{question.question}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <Badge className={STATUS_CLASSES[question.status]}>{statusLabel}</Badge>
            <Badge className={TARGET_CLASSES[question.target]}>
              <MessageCircleQuestion size={11} /> {targetLabel}
            </Badge>
            <Badge className="bg-ink-100 text-ink-500 ring-ink-200">{categoryLabel}</Badge>
            <Badge className="bg-white text-ink-500 ring-ink-200">{sourceLabel}</Badge>
            <Badge className="bg-white text-ink-500 ring-ink-200">{LANGUAGE_NATIVE_LABEL[question.language]}</Badge>
            <Badge className="bg-white text-ink-400 ring-ink-200">
              {labels.priority} {question.priority}
            </Badge>
          </div>
        </div>
        {staff && permissions.canEditFollowUps && (
          <div className="flex shrink-0 items-center gap-0.5">
            <Button
              size="sm"
              variant="ghost"
              disabled={!canMoveUp}
              onClick={() => onMove('up')}
              title="Move up"
              aria-label="Move question up"
            >
              <ChevronUp size={13} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!canMoveDown}
              onClick={() => onMove('down')}
              title="Move down"
              aria-label="Move question down"
            >
              <ChevronDown size={13} />
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing((v) => !v)} title="Edit wording">
              {editing ? <X size={13} /> : <Pencil size={13} />}
            </Button>
            {permissions.canDeleteFollowUps && (
              <Button size="sm" variant="ghost" onClick={confirmDelete} title="Delete question">
                <Trash2 size={13} />
              </Button>
            )}
          </div>
        )}
      </div>

      {question.reason && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-ink-400">
          <span className="font-bold text-ink-500">{labels.reason}:</span> {question.reason}
        </p>
      )}

      {question.status === 'answered' && question.answer && (
        <div className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 ring-1 ring-inset ring-emerald-200">
          <p className="text-[11px] leading-relaxed text-emerald-900">{question.answer}</p>
          <p className="mt-1 text-[10px] text-emerald-700">
            {labels.answeredBy} {question.answeredBy ?? '—'} · {LANGUAGE_NATIVE_LABEL[question.answerLanguage ?? question.language]}
            {question.answeredAt ? ` · ${formatAuditTime(question.answeredAt)}` : ''} · recorded verbatim, anonymised
          </p>
        </div>
      )}

      {editing && (
        <div className="mt-2">
          <label htmlFor={`edit-q-${question.id}`} className="sr-only">
            Edit question wording
          </label>
          <textarea
            id={`edit-q-${question.id}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={2}
            maxLength={500}
            className="w-full rounded-lg border border-ink-200 bg-white p-2.5 text-sm leading-relaxed outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/25"
          />
          <div className="mt-1.5 flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={saveEdit}>
              <CheckCircle2 size={13} /> Save wording
            </Button>
          </div>
        </div>
      )}

      {staff && question.status === 'suggested' && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {permissions.canAskFollowUp && (
            <Button
              size="sm"
              variant="secondary"
              onClick={async () => {
                setNotice((await askFollowUp(sessionId, question.id)) ? null : 'Ask is disabled for your role.')
              }}
            >
              <MessageCircleQuestion size={13} /> {labels.ask}
            </Button>
          )}
          {permissions.canAskFollowUp && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                setNotice((await skipSessionFollowUp(sessionId, question.id)) ? null : 'Skipping is disabled for your role.')
              }}
            >
              {labels.skip}
            </Button>
          )}
        </div>
      )}

      {staff && question.status === 'asked' && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {permissions.canAnswerFollowUp && !answering && (
            <Button size="sm" onClick={() => setAnswering(true)}>
              <CheckCircle2 size={13} /> {labels.answer}
            </Button>
          )}
          {permissions.canAnswerFollowUp && (
            <Button
              size="sm"
              variant="ghost"
              onClick={async () => {
                setNotice((await skipSessionFollowUp(sessionId, question.id)) ? null : 'Skipping is disabled for your role.')
              }}
            >
              {labels.skip}
            </Button>
          )}
        </div>
      )}

      {answering && (
        <FollowUpAnswerInput
          question={question}
          onCancel={() => setAnswering(false)}
          onSubmit={async (text, language) => {
            await answerFollowUpInLanguage(sessionId, question.id, text, language)
            setAnswering(false)
          }}
        />
      )}

      {notice && (
        <p role="status" className="mt-2 rounded-lg bg-ink-50 px-2.5 py-1.5 text-[11px] text-ink-600">
          {notice}
        </p>
      )}
    </li>
  )
}