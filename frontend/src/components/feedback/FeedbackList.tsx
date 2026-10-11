import { useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { Button } from '../ui'
import { formatAuditTime } from '../../lib/format'
import FeedbackBadge, { SeverityBadge } from './FeedbackBadge'
import FeedbackForm from './FeedbackForm'
import { useTriage } from '../../context/TriageContext'
import { useAuth } from '../../context/AuthContext'
import { LAYER_LABEL } from '../../types/modelcard.types'
import type { Feedback, FeedbackUpdateInput } from '../../types/feedback.types'
import type { FeedbackSectionLabels } from '../../services/safetyPolicy'

/**
 * The recorded feedback for one case. Only the author or a facility admin may
 * edit or withdraw a verdict (the backend re-checks this). Feedback is advisory
 * — it never changes a rule, threshold or score.
 */
export function FeedbackList({
  items,
  labels,
  onChanged,
}: {
  items: Feedback[]
  labels: FeedbackSectionLabels
  onChanged?: () => void
}) {
  const { permissions, updateFeedback, deleteFeedback } = useTriage()
  const { user } = useAuth()
  const [editing, setEditing] = useState<Feedback | null>(null)

  const canEdit = (item: Feedback): boolean =>
    permissions.canManageFeedback || item.actorId === user?.id

  const handleUpdate = async (id: string, patch: FeedbackUpdateInput): Promise<boolean> => {
    const ok = await updateFeedback(id, patch)
    if (ok) {
      setEditing(null)
      onChanged?.()
    }
    return ok
  }

  const handleDelete = async (id: string): Promise<void> => {
    const ok = await deleteFeedback(id)
    if (ok) onChanged?.()
  }

  return (
    <div>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="rounded-xl border border-ink-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[12px] font-semibold text-ink-700">
                {labels.targetTypes[item.targetType]} ·{' '}
                <span className="font-normal text-ink-500">{item.targetLabel || item.targetId}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <FeedbackBadge verdict={item.verdict} labels={labels} />
                <SeverityBadge severity={item.severity} labels={labels} />
              </span>
            </div>
            <p className="mt-1.5 text-[11px] text-ink-500">
              {labels.reasonCode}:{' '}
              <span className="font-medium text-ink-600">{labels.reasonCodes[item.reasonCode]}</span>
              {item.layerId && <span> · {LAYER_LABEL[item.layerId]}</span>}
              {item.status !== 'active' && (
                <span> · {item.status === 'edited' ? labels.updated : labels.deletedCount}</span>
              )}
            </p>
            {item.reasonText && <p className="mt-1.5 text-[11.5px] text-ink-600">“{item.reasonText}”</p>}
            {item.suggestedFix && (
              <p className="mt-1 text-[11px] text-ink-500">
                {labels.suggestedFix}: {item.suggestedFix}
              </p>
            )}
            <div className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[10.5px] text-ink-400">
                {labels.actor}: {item.actorRole} · {formatAuditTime(item.createdAt)}
              </span>
              {canEdit(item) && (
                <span className="flex items-center gap-1">
                  <Button variant="ghost" size="sm" title={labels.editTitle} onClick={() => setEditing(item)}>
                    <Pencil size={14} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    title={labels.deleted}
                    onClick={() => {
                      if (window.confirm(labels.confirmDelete)) void handleDelete(item.id)
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      <FeedbackForm
        open={editing !== null}
        labels={labels}
        sessionId={editing?.sessionId ?? null}
        editing={editing}
        onSubmit={async () => false}
        onUpdate={handleUpdate}
        onClose={() => setEditing(null)}
      />
    </div>
  )
}

export default FeedbackList
