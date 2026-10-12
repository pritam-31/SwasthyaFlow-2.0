import { useState } from 'react'
import { AlertTriangle, Activity, ChevronRight, Info, ShieldCheck } from 'lucide-react'
import { Badge, Button, Card, InfoBanner, ProgressBar, cx } from '../ui'
import {
  TRIAGE_LEVELS,
  TRIAGE_LEVEL_STYLES,
  type AiSeverityResult,
  type SeverityOverrideInput,
  type TriageLevel,
} from '../../types/severity.types'

export interface SeverityPanelProps {
  result: AiSeverityResult
  /** When provided, renders the doctor confirmation/override form. */
  onOverride?: (input: SeverityOverrideInput) => Promise<void>
  overriding?: boolean
}

const SOURCE_LABEL: Record<AiSeverityResult['source'], string> = {
  'ai-service': 'AI service',
  fallback: 'Local fallback',
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

/**
 * Renders one AI severity result: score, level, per-component breakdown, the
 * top contributing factors (SHAP-style), the triggered action plan, red flags,
 * missing data and the non-diagnostic disclaimer. Decision support only.
 */
export function SeverityPanel({ result, onOverride, overriding }: SeverityPanelProps) {
  const style = TRIAGE_LEVEL_STYLES[result.triageLevel]
  const [doctorLevel, setDoctorLevel] = useState<TriageLevel>(result.triageLevel)
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const available = result.components.filter((c) => c.available)
  const maxContribution = Math.max(1, ...result.topFactors.map((f) => Math.abs(f.contribution)))

  async function handleSubmit() {
    if (!onOverride) return
    if (!reason.trim()) {
      setError('A reason is required before confirming or overriding.')
      return
    }
    setError(null)
    try {
      await onOverride({
        predictionId: result.predictionId,
        sessionId: result.sessionId,
        doctorLevel,
        reason: reason.trim(),
        aiSeverityScore: result.severityScore,
        aiTriageLevel: result.triageLevel,
      })
      setDone(
        doctorLevel === result.triageLevel
          ? 'Confirmation recorded for model feedback.'
          : 'Override recorded for model feedback.',
      )
      setReason('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record the decision.')
    }
  }

  return (
    <div className="space-y-4">
      <Card pad={false}>
        <div className="grid gap-0 sm:grid-cols-[minmax(0,220px)_1fr]">
          <div className={cx('flex flex-col items-center justify-center gap-1 p-5 text-white', style.bar)}>
            <span className="text-[11px] font-semibold uppercase tracking-wide opacity-90">AI severity</span>
            <span className="text-5xl font-extrabold leading-none">{Math.round(result.severityScore)}</span>
            <span className="text-xs opacity-90">/ 100</span>
            <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-bold ring-1 ring-inset ring-white/30">
              <span className="h-1.5 w-1.5 rounded-full bg-white" />
              {result.triageLevel}
            </span>
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={style.pill}>
                <span className={cx('h-1.5 w-1.5 rounded-full', style.dot)} />
                {result.action.title || result.triageLevel}
              </Badge>
              <Badge className="bg-white text-ink-500 ring-ink-200">
                Confidence {pct(result.confidence)}
              </Badge>
              <Badge className={cx(result.source === 'ai-service' ? 'bg-brand-50 text-brand-700 ring-brand-200' : 'bg-amber-50 text-amber-700 ring-amber-200')}>
                {SOURCE_LABEL[result.source]}
              </Badge>
              {result.fallbacksUsed.length > 0 && (
                <Badge className="bg-amber-50 text-amber-700 ring-amber-200" icon={<AlertTriangle size={11} />}>
                  Degraded
                </Badge>
              )}
            </div>

            <div className="mt-3">
              <ProgressBar value={result.severityScore} tone={style.tone} />
              <div className="mt-2 flex items-center justify-between text-[11px] text-ink-400">
                <span>Low</span>
                <span>Moderate</span>
                <span>Urgent</span>
                <span>Critical</span>
              </div>
            </div>

            {result.action.targetResponseMinutes != null && (
              <p className="mt-3 text-xs text-ink-500">
                Target response: within {result.action.targetResponseMinutes} minutes.
              </p>
            )}
            <p className="mt-1 text-[11px] text-ink-400">
              Patient <span className="font-semibold text-ink-500">{result.patientIdHash}</span>
              {result.predictionId ? ` · prediction ${result.predictionId.slice(0, 8)}` : ''}
            </p>
          </div>
        </div>
      </Card>

      {result.redFlags.length > 0 && (
        <InfoBanner tone="rose">
          <p className="font-bold">Red flags detected</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            {result.redFlags.map((flag) => (
              <li key={flag}>{flag}</li>
            ))}
          </ul>
        </InfoBanner>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Signal breakdown" subtitle="Per-model score and learned fusion weight.">
          {available.length === 0 ? (
            <p className="text-xs text-ink-400">No signals were available for this patient.</p>
          ) : (
            <ul className="space-y-3">
              {available.map((component) => (
                <li key={component.key}>
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink-700">{component.label}</span>
                    <span className="text-ink-400">
                      {Math.round(component.score)} · weight {pct(component.weight)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <ProgressBar value={component.score} tone={style.tone} />
                  </div>
                  {component.signals.length > 0 && (
                    <p className="mt-1 text-[11px] leading-snug text-ink-400">{component.signals.slice(0, 3).join(' · ')}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Why this score" subtitle="Top contributing factors (explainability).">
          {result.topFactors.length === 0 ? (
            <p className="text-xs text-ink-400">No dominant factor — signals were within normal ranges.</p>
          ) : (
            <ul className="space-y-2.5">
              {result.topFactors.map((factor) => {
                const width = Math.max(6, (Math.abs(factor.contribution) / maxContribution) * 100)
                return (
                  <li key={`${factor.category}-${factor.name}`}>
                    <div className="flex items-center justify-between text-xs">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-ink-700">
                        <Activity size={12} className={factor.direction === 'increases' ? 'text-rose-500' : 'text-emerald-500'} />
                        {factor.name}
                      </span>
                      <span className={cx('text-[11px] font-bold', factor.direction === 'increases' ? 'text-rose-600' : 'text-emerald-600')}>
                        {factor.direction === 'increases' ? '+' : '−'}
                        {Math.abs(factor.contribution).toFixed(1)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
                      <div
                        className={cx('h-full rounded-full', factor.direction === 'increases' ? 'bg-rose-400' : 'bg-emerald-400')}
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-ink-400">{factor.detail}</p>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>
      </div>

      <Card title="Triggered action" subtitle="Suggested workflow only — a clinician decides.">
        <div className="flex items-start gap-3 rounded-xl bg-brand-50/50 p-4 ring-1 ring-inset ring-brand-100">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <ShieldCheck size={16} />
          </span>
          <div className="text-xs leading-relaxed text-ink-600">
            <p className="font-bold text-ink-800">{result.action.title}</p>
            {result.action.actions.length > 0 && (
              <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
                {result.action.actions.map((action) => (
                  <li key={action}>{action}</li>
                ))}
              </ul>
            )}
            {result.action.notify.length > 0 && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5">
                Notify:
                {result.action.notify.map((who) => (
                  <Badge key={who} className="bg-white text-ink-500 ring-ink-200">{who}</Badge>
                ))}
              </p>
            )}
          </div>
        </div>
      </Card>

      {result.missingData.length > 0 && (
        <Card title="Missing information" subtitle="Fields that would improve the estimate.">
          <div className="flex flex-wrap gap-1.5">
            {result.missingData.map((item) => (
              <Badge key={item} className="bg-amber-50 text-amber-700 ring-amber-200">{item}</Badge>
            ))}
          </div>
        </Card>
      )}

      {onOverride && (
        <Card title="Clinician decision" subtitle="Confirm or override the AI level — recorded for model feedback.">
          <div className="flex flex-wrap gap-1.5">
            {TRIAGE_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                onClick={() => setDoctorLevel(level)}
                className={cx(
                  'rounded-full px-3 py-1.5 text-[11px] font-bold ring-1 ring-inset transition-colors',
                  doctorLevel === level
                    ? TRIAGE_LEVEL_STYLES[level].pill
                    : 'bg-white text-ink-500 ring-ink-200 hover:bg-ink-50',
                )}
              >
                {level}
              </button>
            ))}
          </div>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason (required) — e.g. observed vitals, clinical judgement."
            rows={3}
            className="mt-3 w-full resize-y rounded-xl border border-ink-200 bg-white p-3 text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {error && <p className="mt-2 text-xs font-semibold text-rose-600">{error}</p>}
          {done && <p className="mt-2 text-xs font-semibold text-emerald-600">{done}</p>}
          <div className="mt-3 flex items-center justify-between gap-3">
            <p className="text-[11px] text-ink-400">
              {doctorLevel === result.triageLevel
                ? 'Matches the AI level — records a confirmation.'
                : `Overrides the AI level (${result.triageLevel}).`}
            </p>
            <Button onClick={handleSubmit} disabled={overriding}>
              {overriding ? 'Recording…' : 'Record decision'}
              <ChevronRight size={14} />
            </Button>
          </div>
        </Card>
      )}

      <div className="flex items-start gap-2 rounded-2xl bg-ink-50 px-4 py-3 text-[11px] leading-relaxed text-ink-500">
        <Info size={13} className="mt-0.5 shrink-0 text-ink-400" />
        <div>
          <p>{result.disclaimer}</p>
          <p className="mt-1 text-ink-400">
            Models: {Object.entries(result.modelVersions).map(([k, v]) => `${k} ${v}`).join(' · ')}
            {result.fallbacksUsed.length > 0 ? ` · fallbacks: ${result.fallbacksUsed.join('; ')}` : ''}
          </p>
        </div>
      </div>
    </div>
  )
}
