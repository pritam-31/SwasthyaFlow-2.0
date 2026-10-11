/**
 * Full detail of one stored photo: the REDACTED image the backend stored, the
 * PII regions it black-boxed, the non-diagnostic feature rows, warnings and the
 * review outcome. The raw original never reaches the browser.
 */

import { Eye, ImageOff, Loader2, ShieldCheck, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { formatAuditTime } from '../../lib/format'
import { fetchRedactedImageUrl } from '../../services/visualApi'
import { VISUAL_TYPE_LABELS } from '../../services/safetyPolicy'
import type { PiiRegion, VisualRecord, VisualReviewStatus } from '../../types/visual.types'
import { Badge, Modal } from '../ui'
import VisualFeaturesCard from './VisualFeaturesCard'

const STATUS_META: Record<VisualReviewStatus, { label: string; classes: string }> = {
  'pending-review': { label: 'Needs verification', classes: 'bg-amber-50 text-amber-700 ring-amber-200' },
  verified: { label: 'Verified', classes: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  rejected: { label: 'Rejected', classes: 'bg-rose-50 text-rose-700 ring-rose-200' },
}

function piiLabel(region: PiiRegion): string {
  return region.type.replace(/-/g, ' ')
}

export default function VisualPreview({ visual }: { visual: VisualRecord }) {
  const [loaded, setLoaded] = useState<{ id: string; url: string | null; failed: boolean }>({
    id: '',
    url: null,
    failed: false,
  })
  const [zoom, setZoom] = useState(false)
  const statusMeta = STATUS_META[visual.status]
  const current = loaded.id === visual.id ? loaded : { id: visual.id, url: null, failed: false }
  const url = current.url
  const failed = current.failed

  useEffect(() => {
    let revoked = false
    let created: string | null = null
    fetchRedactedImageUrl(visual.id)
      .then((objectUrl) => {
        if (revoked) {
          URL.revokeObjectURL(objectUrl)
          return
        }
        created = objectUrl
        setLoaded({ id: visual.id, url: objectUrl, failed: false })
      })
      .catch(() => {
        if (!revoked) setLoaded({ id: visual.id, url: null, failed: true })
      })
    return () => {
      revoked = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [visual.id])

  return (
    <article className="overflow-hidden rounded-xl border border-ink-200 bg-white">
      <header className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-ink-500 ring-1 ring-inset ring-ink-200">
          <ShieldCheck size={14} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-ink-800">{visual.fileName}</p>
          <p className="text-[10px] text-ink-400">
            {VISUAL_TYPE_LABELS[visual.visualType] ?? 'Photo'} · stored as redacted JPEG ·{' '}
            {formatAuditTime(visual.createdAt)}
          </p>
        </div>
        <Badge className={statusMeta.classes}>{statusMeta.label}</Badge>
      </header>

      <div className="space-y-3 p-3.5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="relative h-32 w-32 shrink-0 overflow-hidden rounded-xl border border-ink-200 bg-ink-50">
            {url ? (
              <button type="button" onClick={() => setZoom(true)} className="h-full w-full" aria-label="View redacted photo full size">
                <img src={url} alt="Redacted clinical photograph" className="h-full w-full object-cover" />
              </button>
            ) : (
              <span className="flex h-full w-full items-center justify-center text-ink-300">
                {failed ? <ImageOff size={20} /> : <Loader2 size={18} className="animate-spin" />}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-1.5">
            <Badge className="bg-emerald-50 text-emerald-700 ring-emerald-200" icon={<ShieldCheck size={11} />}>
              Redacted on the server — raw original deleted
            </Badge>
            {visual.piiSummary.regionCount > 0 ? (
              <ul className="flex flex-wrap gap-1.5">
                {visual.piiSummary.byType.map((t) => (
                  <li key={t.type} className="rounded-lg bg-ink-100 px-2 py-1 text-[10px] font-semibold text-ink-600">
                    {t.count} × {t.type.replace(/-/g, ' ')}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[11px] text-ink-400">No PII region was detected in this photo.</p>
            )}
            {visual.pii.length > 0 && (
              <details className="text-[11px] text-ink-500">
                <summary className="cursor-pointer font-bold text-ink-600">Why regions were redacted</summary>
                <ul className="mt-1 space-y-0.5">
                  {visual.pii.map((r) => (
                    <li key={r.id} className="flex items-center gap-1.5">
                      {r.source === 'face-heuristic' ? <UserX size={11} /> : <Eye size={11} />}
                      {piiLabel(r)} · {r.source} · {Math.round(r.confidence * 100)}%
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        </div>

        <VisualFeaturesCard visual={visual} />

        {visual.warnings.length > 0 && (
          <section>
            <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">Warnings</h4>
            <ul className="mt-1 space-y-1">
              {visual.warnings.map((w, i) => (
                <li key={i} className="rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800">
                  {w}
                </li>
              ))}
            </ul>
          </section>
        )}

        {visual.reviewedBy && (
          <p className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-500">
            Reviewed by <strong className="text-ink-700">{visual.reviewedBy}</strong>
            {visual.reviewedByRole ? ` (${visual.reviewedByRole})` : ''} · {formatAuditTime(visual.updatedAt)}
            {visual.reviewNote && <span className="mt-0.5 block">Note: {visual.reviewNote}</span>}
            {visual.rejectionReason && (
              <span className="mt-0.5 block text-rose-700">Rejected: {visual.rejectionReason}</span>
            )}
          </p>
        )}

        <p className="border-t border-ink-100 pt-2 text-[10px] leading-relaxed text-ink-400">{visual.disclaimer}</p>
      </div>

      <Modal open={zoom} onClose={() => setZoom(false)} title="Redacted clinical photograph" wide>
        {url ? (
          <img src={url} alt="Redacted clinical photograph" className="max-h-[70vh] w-full rounded-xl object-contain" />
        ) : (
          <p className="text-sm text-ink-500">The image could not be loaded.</p>
        )}
        <p className="mt-3 text-xs text-ink-500">
          This is the redacted image only — faces and text identifiers are black-boxed and the original was not stored.
        </p>
      </Modal>
    </article>
  )
}
