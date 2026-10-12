import { useEffect, useState } from 'react'
import { BrainCircuit, Sparkles } from 'lucide-react'
import { PageHeader, Card, Button, Badge, EmptyState, InfoBanner, Skeleton, cx } from '../components/ui'
import { SeverityPanel } from '../components/severity/SeverityPanel'
import {
  fetchAiTriageStatus,
  fetchSessions,
  predictSeverityForSession,
  submitSeverityOverride,
  type ApiSession,
} from '../services/api'
import { useApp } from '../store/AppStore'
import type { AiSeverityResult, AiTriageStatus } from '../types/severity.types'

/**
 * AI Triage workspace — run the data-driven severity pipeline on a stored
 * session and review the explainable result. Decision support only: the AI
 * proposes a level, the clinician confirms or overrides it.
 */
export default function AiTriagePage() {
  const { pushToast } = useApp()
  const [sessions, setSessions] = useState<ApiSession[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [status, setStatus] = useState<AiTriageStatus | null>(null)
  const [result, setResult] = useState<AiSeverityResult | null>(null)
  const [loadingList, setLoadingList] = useState(true)
  const [loading, setLoading] = useState(false)
  const [overriding, setOverriding] = useState(false)

  useEffect(() => {
    let active = true
    Promise.all([fetchSessions(), fetchAiTriageStatus()])
      .then(([sessionPayload, statusPayload]) => {
        if (!active) return
        setSessions(sessionPayload.sessions)
        setStatus(statusPayload)
        if (sessionPayload.sessions[0]) setSelectedId(sessionPayload.sessions[0].id)
      })
      .catch((err) => {
        if (active) pushToast('warning', err instanceof Error ? err.message : 'Could not load sessions.')
      })
      .finally(() => {
        if (active) setLoadingList(false)
      })
    return () => {
      active = false
    }
  }, [pushToast])

  async function run() {
    if (!selectedId) return
    setLoading(true)
    setResult(null)
    try {
      const payload = await predictSeverityForSession(selectedId)
      setResult(payload.result)
      if (payload.result.source === 'fallback') {
        pushToast('warning', 'AI service unavailable — showing the local fallback estimate.')
      }
    } catch (err) {
      pushToast('warning', err instanceof Error ? err.message : 'AI triage failed.')
    } finally {
      setLoading(false)
    }
  }

  async function override(input: Parameters<typeof submitSeverityOverride>[0]) {
    setOverriding(true)
    try {
      const payload = await submitSeverityOverride(input)
      pushToast('success', payload.result.message)
    } finally {
      setOverriding(false)
    }
  }

  const selected = sessions.find((s) => s.id === selectedId)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Decision support"
        title="AI Triage"
        subtitle="Data-driven severity scoring with explainable factors. Non-diagnostic — a clinician confirms or overrides every result."
        icon={<BrainCircuit size={22} />}
        action={
          <Button variant="secondary" onClick={run} disabled={!selectedId || loading}>
            <Sparkles size={15} />
            {loading ? 'Running…' : 'Run AI triage'}
          </Button>
        }
      />

      {status && (
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            className={cx(
              status.reachable
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                : 'bg-amber-50 text-amber-700 ring-amber-200',
            )}
          >
            <span className={cx('h-1.5 w-1.5 rounded-full', status.reachable ? 'bg-emerald-500' : 'bg-amber-500')} />
            AI service {status.reachable ? 'online' : status.configured ? 'unreachable' : 'not configured'}
          </Badge>
          {status.fallbackAvailable && (
            <Badge className="bg-white text-ink-500 ring-ink-200">Local fallback available</Badge>
          )}
        </div>
      )}

      <Card title="Select a patient session">
        {loadingList ? (
          <Skeleton className="h-10 w-full" />
        ) : sessions.length === 0 ? (
          <EmptyState icon={<BrainCircuit size={20} />} title="No sessions yet" hint="Create an intake first, then run AI triage." />
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[260px] flex-1 text-xs font-semibold text-ink-600">
              Patient session
              <select
                value={selectedId}
                onChange={(e) => {
                  setSelectedId(e.target.value)
                  setResult(null)
                }}
                className="mt-1.5 w-full rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-normal text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.patientId} · {s.intakePoint} · {s.language}
                  </option>
                ))}
              </select>
            </label>
            <Button onClick={run} disabled={!selectedId || loading}>
              {loading ? 'Running…' : 'Run AI triage'}
            </Button>
          </div>
        )}
        {selected && (
          <p className="mt-3 text-[11px] text-ink-400">
            The AI receives anonymised fields only — age band, sex, symptoms text, extracted vitals/labs and derived
            history. No names, contact details or raw documents are sent.
          </p>
        )}
      </Card>

      {loading && (
        <Card>
          <div className="space-y-3">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </Card>
      )}

      {result && <SeverityPanel result={result} onOverride={override} overriding={overriding} />}

      {!result && !loading && (
        <InfoBanner tone="brand">
          Pick a session and press <strong>Run AI triage</strong>. The score fuses vitals (NEWS2/qSOFA), symptoms
          (multilingual NLP), lab thresholds, history risk and imaging signals, then explains the result factor by
          factor. Every prediction is logged; the AI never makes the final call.
        </InfoBanner>
      )}
    </div>
  )
}
