/**
 * Non-diagnostic feature panel for one stored photo.
 *
 * Renders the descriptive rows, appearance notes and amber concern flags the
 * backend produced. Nothing here names a condition, severity or treatment —
 * concerns are phrased as questions for a human to follow up.
 */

import { AlertTriangle, FileImage, ScanText, Sparkles } from 'lucide-react'
import { VISUAL_TYPE_LABELS } from '../../services/safetyPolicy'
import type { VisualRecord } from '../../types/visual.types'
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

      <section>
        <h4 className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-ink-400">
          <ScanText size={12} /> Descriptive rows
        </h4>
        <div className="mt-1 overflow-hidden rounded-lg border border-ink-200">
          <table className="w-full text-left text-xs">
            <tbody className="divide-y divide-ink-100">
              {extraction.features.map((f) => (
                <tr key={f.id}>
                  <td className="px-3 py-2 font-semibold text-ink-700">{f.label}</td>
                  <td className="px-3 py-2 text-ink-600">{f.value}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <span className={cx('font-mono text-[11px] font-bold', f.confidence >= 0.8 ? 'text-emerald-700' : 'text-amber-700')}>
                      {Math.round(f.confidence * 100)}%
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

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
