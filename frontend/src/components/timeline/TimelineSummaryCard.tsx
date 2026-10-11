/**
 * Timeline section card (P0-4).
 *
 * Renders the AI-generated chronological summary plus a collapsible event list.
 * The summary and event text are rendered verbatim from the backend — they are
 * never passed through the non-diagnostic sanitizer (the English summary
 * carries the sanctioned phrase "not a diagnosis" by design).
 *
 * Behaviour:
 *  - Auto-fetches the timeline for the session on mount (404 -> "not built").
 *  - `readOnly` hides all staff actions (used on patient-facing surfaces).
 *  - Staff with `canBuildTimeline` / `canEditTimeline` / `canAcceptTimeline`
 *    get build, regenerate, accept, add and per-event edit/delete controls.
 */

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, ChevronDown, ListPlus, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { Badge, Button, Card, cx, EmptyState, Skeleton } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { TIMELINE_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import { LANGUAGE_NATIVE_LABEL } from '../../types/language.types'
import type { PatientSession } from '../../types/triage'
import type { TimelineEvent } from '../../types/timeline.types'
import TimelineView from './TimelineView'
import { AddTimelineEventModal, EditTimelineEventModal } from './TimelineEditor'

const STATUS_CLASSES: Record<string, string> = {
  'ai-draft': 'bg-sky-50 text-sky-700 ring-sky-200',
  'human-edited': 'bg-violet-50 text-violet-700 ring-violet-200',
  accepted: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
}

export default function TimelineSummaryCard({
  session,
  readOnly = false,
  compact = false,
  autoRefresh = true,
}: {
  session: PatientSession
  /** Hide every staff action (patient-facing surfaces). */
  readOnly?: boolean
  /** Compact presentation — summary + meta only, events collapsed. */
  compact?: boolean
  /** Fetch on mount even when the caller already primed the cache. */
  autoRefresh?: boolean
}) {
  const {
    timelinesBySession,
    timelineLoading,
    permissions,
    refreshSessionTimeline,
    buildSessionTimeline,
    regenerateSessionTimeline,
    acceptSessionTimeline,
    removeTimelineEvent,
  } = useTriage()

  const timeline = timelinesBySession[session.id]
  const loading = timelineLoading[session.id] ?? false
  const built = timeline !== null && timeline !== undefined
  const [expanded, setExpanded] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [editing, setEditing] = useState<TimelineEvent | null>(null)
  const [busy, setBusy] = useState<'build' | 'regenerate' | 'accept' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (autoRefresh && timeline === undefined && !loading) {
      refreshSessionTimeline(session.id)
    }
  }, [autoRefresh, timeline, loading, session.id, refreshSessionTimeline])

  const lang = timeline?.language ?? 'en'
  const labels = TIMELINE_SECTION_LABELS[lang] ?? TIMELINE_SECTION_LABELS.en
  const staff = !readOnly && (permissions.canBuildTimeline || permissions.canEditTimeline || permissions.canAcceptTimeline)

  const run = async (action: 'build' | 'regenerate' | 'accept') => {
    setBusy(action)
    setNotice(null)
    const fn =
      action === 'build'
        ? () => buildSessionTimeline(session.id)
        : action === 'regenerate'
          ? () => regenerateSessionTimeline(session.id)
          : () => acceptSessionTimeline(session.id)
    const result = await fn()
    setBusy(null)
    setNotice(
      result
        ? action === 'accept'
          ? 'Timeline accepted as reviewed — it is now the reviewed chronology.'
          : action === 'build'
            ? 'Timeline draft built from the session sources.'
            : 'Timeline draft regenerated from the session sources.'
        : 'Your role cannot do this, or the backend rejected it.',
    )
  }

  const confirmDelete = async (event: TimelineEvent) => {
    if (!window.confirm(`Delete this event?\n\n“${event.eventText.slice(0, 140)}”`)) return
    const result = await removeTimelineEvent(session.id, event.eventId)
    setNotice(result ? 'Event removed — the timeline is now human-edited.' : 'The event could not be removed.')
  }

  const sourceCount = useMemo(() => {
    if (!timeline) return 0
    return new Set(timeline.events.map((e) => e.source)).size
  }, [timeline])

  return (
    <Card
      id={`timeline-${session.id}`}
      title={labels.title}
      subtitle={labels.subtitle}
      action={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {timeline && (
            <>
              <Badge className="bg-white text-ink-500 ring-ink-200">{LANGUAGE_NATIVE_LABEL[timeline.language]}</Badge>
              <Badge className={STATUS_CLASSES[timeline.status] ?? 'bg-ink-100 text-ink-500 ring-ink-200'}>
                {timeline.status === 'ai-draft'
                  ? labels.statusDraft
                  : timeline.status === 'human-edited'
                    ? labels.statusEdited
                    : labels.statusAccepted}
              </Badge>
            </>
          )}
          {!readOnly && staff && (
            <Button size="sm" variant="secondary" onClick={() => setAddOpen(true)}>
              <ListPlus size={13} /> {labels.addEvent}
            </Button>
          )}
        </div>
      }
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-2/3 rounded" />
          <Skeleton className="h-3.5 w-1/2 rounded" />
        </div>
      ) : !built ? (
        <EmptyState
          icon={<Sparkles size={20} />}
          title={labels.notBuilt}
          hint={labels.buildHint}
        />
      ) : (
        <div className={cx('space-y-4', compact && 'space-y-3')}>
          {notice && (
            <p role="status" className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
              {notice}
            </p>
          )}

          <div>
            <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
              <Sparkles size={12} className="text-brand-500" /> {labels.summary}
            </p>
            <p className="mt-1.5 rounded-xl border border-brand-100 bg-brand-50/40 p-3 text-sm leading-relaxed text-ink-700">
              {timeline.summary}
            </p>
          </div>

          {timeline.warnings.length > 0 && (
            <ul className="space-y-1">
              {timeline.warnings.map((w) => (
                <li key={w} className="flex items-center gap-1.5 text-[11px] text-ink-500">
                  <CheckCircle2 size={12} className="shrink-0 text-brand-500" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <p className="text-[10px] text-ink-400">
            {timeline.events.length} event(s) · {sourceCount} source(s) · generated {formatAuditTime(timeline.generatedAt)}
            · {timeline.status === 'ai-draft' ? 'draft — requires human review' : 'reviewed by a human'}
          </p>

          <div className="flex flex-wrap items-center gap-1.5">
            {!compact && (
              <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)}>
                <ChevronDown size={13} className={cx('transition-transform', expanded && 'rotate-180')} />
                {labels.events} ({timeline.events.length})
              </Button>
            )}
            {staff && !readOnly && (
              <>
                {timeline.status !== 'accepted' && (
                  <Button size="sm" variant="success" disabled={busy !== null} onClick={() => run('accept')}>
                    {busy === 'accept' ? <Loader2 size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    {labels.accept}
                  </Button>
                )}
                <Button size="sm" variant="secondary" disabled={busy !== null} onClick={() => run('regenerate')}>
                  {busy === 'regenerate' ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {labels.regenerate}
                </Button>
              </>
            )}
          </div>

          {(!compact || expanded) && (
            <div className={cx(compact && 'mt-3')}>
              <TimelineView
                session={session}
                timeline={timeline}
                canEdit={staff && !readOnly}
                onEditEvent={staff && !readOnly ? setEditing : undefined}
                onDeleteEvent={staff && !readOnly ? confirmDelete : undefined}
              />
              <p className="mt-4 rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
                {TIMELINE_SECTION_LABELS.en.subtitle} Relative "days before intake" times are never converted into an
                invented calendar date.
              </p>
            </div>
          )}

          {staff && !readOnly && (
            <AddTimelineEventModal session={session} open={addOpen} onClose={() => setAddOpen(false)} />
          )}
          {staff && !readOnly && (
            <EditTimelineEventModal session={session} event={editing} open={!!editing} onClose={() => setEditing(null)} />
          )}
        </div>
      )}

      {!built && staff && !readOnly && (
        <div className="mt-3">
          <Button size="sm" disabled={busy !== null} onClick={() => run('build')}>
            {busy === 'build' ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
            {labels.build}
          </Button>
        </div>
      )}
    </Card>
  )
}