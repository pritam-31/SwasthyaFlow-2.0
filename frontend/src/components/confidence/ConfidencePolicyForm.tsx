import { useEffect, useState } from 'react'
import { Gauge, Save } from 'lucide-react'
import { Button, Card, InfoBanner } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CONFIDENCE_SECTION_LABELS } from '../../services/safetyPolicy'
import type { ConfidenceThresholds } from '../../types/confidence.types'

type Lang = 'en' | 'hi' | 'or'

/** Thresholds are edited as whole percentages (5..99) for legibility. */
interface PercentDraft {
  low: string
  veryLow: string
  aggregate: string
}

function toPercentDraft(thresholds: ConfidenceThresholds): PercentDraft {
  return {
    low: String(Math.round(thresholds.lowConfidenceThreshold * 100)),
    veryLow: String(Math.round(thresholds.veryLowConfidenceThreshold * 100)),
    aggregate: String(Math.round(thresholds.aggregateAlertThreshold * 100)),
  }
}

function parsePercent(raw: string): number | null {
  if (!raw.trim()) return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return Math.round(n)
}

function isValid(draft: PercentDraft): boolean {
  const low = parsePercent(draft.low)
  const veryLow = parsePercent(draft.veryLow)
  const aggregate = parsePercent(draft.aggregate)
  if (low === null || veryLow === null || aggregate === null) return false
  const inRange = (n: number) => n >= 5 && n <= 99
  return inRange(low) && inRange(veryLow) && inRange(aggregate) && veryLow < low
}

/**
 * Per-facility confidence thresholds (admin). These decide which outputs are
 * surfaced for review and when a case aggregate alerts the dashboard. Editing
 * them is a workflow change — never a clinical one.
 */
export function ConfidencePolicyForm({ lang = 'en' }: { lang?: Lang }) {
  const { permissions, confidencePolicy, refreshConfidencePolicy, saveConfidencePolicy } = useTriage()
  const labels = CONFIDENCE_SECTION_LABELS[lang]
  const [draft, setDraft] = useState<PercentDraft | null>(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    if (!permissions.canViewConfidencePolicy) return
    void refreshConfidencePolicy()
  }, [permissions.canViewConfidencePolicy, refreshConfidencePolicy])

  useEffect(() => {
    if (confidencePolicy) setDraft(toPercentDraft(confidencePolicy.thresholds))
  }, [confidencePolicy])

  if (!permissions.canViewConfidencePolicy) return null

  const editable = permissions.canEditConfidencePolicy
  const valid = draft !== null && isValid(draft)

  const save = async () => {
    if (!draft || !valid) {
      setNotice(labels.policyInvalid)
      return
    }
    setSaving(true)
    const patch: Partial<ConfidenceThresholds> = {
      lowConfidenceThreshold: parsePercent(draft.low)! / 100,
      veryLowConfidenceThreshold: parsePercent(draft.veryLow)! / 100,
      aggregateAlertThreshold: parsePercent(draft.aggregate)! / 100,
    }
    const ok = await saveConfidencePolicy(patch)
    setSaving(false)
    setNotice(ok ? labels.saved : labels.loadFailed)
  }

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Gauge size={15} className="text-brand-600" /> {labels.policyTitle}
        </span>
      }
      subtitle={labels.policySubtitle}
      action={
        editable ? (
          <Button variant="primary" size="sm" disabled={saving || !valid} onClick={() => void save()}>
            <Save size={14} /> {labels.save}
          </Button>
        ) : undefined
      }
    >
      {draft ? (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                {labels.lowThreshold}
              </label>
              <input
                type="number"
                min={5}
                max={99}
                value={draft.low}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, low: e.target.value })}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                {labels.veryLowThreshold}
              </label>
              <input
                type="number"
                min={5}
                max={99}
                value={draft.veryLow}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, veryLow: e.target.value })}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400">
                {labels.aggregateThreshold}
              </label>
              <input
                type="number"
                min={5}
                max={99}
                value={draft.aggregate}
                disabled={!editable}
                onChange={(e) => setDraft({ ...draft, aggregate: e.target.value })}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 text-[13px] text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
          <p className="text-[10.5px] text-ink-400">{labels.policyInvalid}</p>
          {notice && <InfoBanner>{notice}</InfoBanner>}
        </div>
      ) : (
        <p className="text-[11px] text-ink-400">{labels.loadFailed}</p>
      )}
    </Card>
  )
}

export default ConfidencePolicyForm
