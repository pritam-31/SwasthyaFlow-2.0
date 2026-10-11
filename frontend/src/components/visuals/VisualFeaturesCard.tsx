/**
 * Non-diagnostic feature panel for one stored photo.
 *
 * Renders the descriptive rows, appearance notes and amber concern flags the
 * backend produced. Nothing here names a condition, severity or treatment —
 * concerns are phrased as questions for a human to follow up.
 */

import { AlertTriangle, FileImage, Sparkles } from 'lucide-react'
import { VISUAL_TYPE_LABELS } from '../../services/safetyPolicy'
import type { VisualRecord } from '../../types/visual.types'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, cx } from '../ui'

export default function VisualFeaturesCard({ visual }: { visual: VisualRecord }) {
  const { extraction } = visual
  const typeLabel = VISUAL_TYPE_LABELS[extraction.visualType] ?? 'Unclassified photo'

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <Badge className="bg-white text-ink-600 ring-ink-200" icon={<FileImage size={11} />}>
          {typeLabel} · {Math.round(extraction.typeConfidence * 100)}%
        </Badge>
        <span className="text-ink-400">
          {visual.width} × {visual.height} px · {visual.piiSummary.regionCount} redaction(s)
        </span>
      </div>

      <p className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] leading-relaxed text-ink-500">
        Typed as &ldquo;{typeLabel}&rdquo; because {extraction.typeBasis}.
      </p>

      {extraction.appearance.length > 0 && (
        <section>
          <h4 className="text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">What the photo shows</h4>
          <ul className="mt-1 space-y-1">
            {extraction.appearance.map((note, i) => (
              <li key={i} className="rounded-lg bg-brand-50/70 px-3 py-1.5 text-xs text-brand-900">
                {note}
              </li>
            ))}
          </ul>
        </section>
      )}

      {extraction.features.length > 0 && (
        <AppDataGrid<{ id: string; label: string; value: string; confidence: number }>
          rows={extraction.features}
          ariaLabel="Descriptive rows"
          getRowId={(f) => f.id}
          hideToolbar
          hideFooter
          defaultDensity="compact"
          columns={[
            {
              field: 'label',
              headerName: 'Label',
              flex: 1,
              renderCell: (p) => <span className="font-semibold text-ink-700">{p.row.label}</span>,
            },
            {
              field: 'value',
              headerName: 'Value',
              flex: 1,
              renderCell: (p) => <span className="text-ink-600">{p.row.value}</span>,
            },
            {
              field: 'confidence',
              headerName: 'Confidence',
              width: 140,
              renderCell: (p) => {
                const pct = Math.round(p.row.confidence * 100)
                return (
                  <span className={cx(
                    'font-mono text-[11px] font-bold',
                    p.row.confidence >= 0.8 ? 'text-emerald-700' : 'text-amber-700',
                  )}>
                    {pct}%
                  </span>
                )
              },
            },
          ]}
        />
      )}

      <section>
        <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
          <AlertTriangle size={12} /> Concern flags ({extraction.concerns.length})
        </h4>
        {extraction.concerns.length === 0 ? (
          <p className="mt-1 text-xs text-ink-500">
            No body-surface concern flag was raised — the descriptive rows still need a human look.
          </p>
        ) : (
          <ul className="mt-1 space-y-1.5">
            {extraction.concerns.map((c) => (
              <li key={c.id} className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-bold">
                  <Sparkles size={11} className="mr-1 inline" />
                  {c.label}
                </p>
                <p className="mt-0.5 opacity-90">{c.reason}</p>
                <p className="mt-1 text-[11px] font-semibold">{c.suggestedAction}</p>
                <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide opacity-70">{c.ruleId}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
