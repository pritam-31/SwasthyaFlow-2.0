import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Layers, Scissors } from 'lucide-react'
import { Button, Card, InfoBanner, PageHeader, Stagger, StaggerItem } from '../components/ui'
import { ConsentStatusCard } from '../components/consent/ConsentStatusCard'
import { ConsentCoverageCard } from '../components/consent/ConsentCoverageCard'
import { PatientConsentList } from '../components/consent/PatientConsentList'
import { SessionDataInventory } from '../components/retentionUi/SessionDataInventory'
import { RetentionTimeline } from '../components/retentionUi/RetentionTimeline'
import { PendingDeletionsTable } from '../components/retentionUi/PendingDeletionsTable'
import { RetentionSlaCard } from '../components/retentionUi/RetentionSlaCard'
import { PolicyDiffTable } from '../components/retentionUi/PolicyDiffTable'
import { RetentionExportsList } from '../components/retentionUi/RetentionExportsList'
import { BulkRetentionDialog } from '../components/retentionUi/BulkRetentionDialog'
import { PruneAuditDialog } from '../components/retentionUi/PruneAuditDialog'
import { useAuth } from '../context/AuthContext'
import { useTriage } from '../context/TriageContext'
import { permissionsFor } from '../services/rbacService'
import { fetchConsentCoverage, fetchMyConsent } from '../services/consentApi'
import {
  fetchPendingDeletions,
  fetchPolicyDiff,
  fetchRetentionExports,
  fetchRetentionSla,
  fetchSessionInventory,
  fetchRetentionTimeline,
} from '../services/retentionUiApi'
import type { ConsentRecord } from '../types/retention.types'
import type { ConsentCoverage } from '../types/consent.types'
import type {
  PendingDeletions,
  PolicyDiff,
  RetentionExportSummary,
  RetentionSlaView,
  RetentionTimeline as RetentionTimelineModel,
  SessionDataInventory as SessionDataInventoryModel,
} from '../types/retentionUi.types'

export default function DataPrivacy() {
  const { user } = useAuth()
  const { sessions } = useTriage()
  const [params] = useSearchParams()
  const perms = user ? permissionsFor(user.role) : null

  const isPatient = user?.role === 'patient'
  const [mine, setMine] = useState<ConsentRecord[]>([])
  const [sessionId, setSessionId] = useState(() => params.get('session') ?? '')
  const [inventory, setInventory] = useState<SessionDataInventoryModel | null>(null)
  const [timeline, setTimeline] = useState<RetentionTimelineModel | null>(null)

  const [coverage, setCoverage] = useState<ConsentCoverage | null>(null)
  const [pending, setPending] = useState<PendingDeletions | null>(null)
  const [sla, setSla] = useState<RetentionSlaView | null>(null)
  const [diff, setDiff] = useState<PolicyDiff | null>(null)
  const [exports, setExports] = useState<RetentionExportSummary[]>([])
  const [bulkOpen, setBulkOpen] = useState(false)
  const [pruneOpen, setPruneOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canCase = Boolean(perms && (perms.canViewSessionInventory || perms.canViewConsentHistory))
  const canFacility = Boolean(
    perms && (perms.canViewConsentCoverage || perms.canViewPendingDeletions || perms.canViewRetentionSla),
  )

  function choose(id: string) {
    setSessionId(id)
    setInventory(null)
    setTimeline(null)
    setError(null)
    if (!id) return
    fetchSessionInventory(id)
      .then(setInventory)
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load the inventory.'))
    fetchRetentionTimeline(id)
      .then(setTimeline)
      .catch(() => setTimeline(null))
  }

  const loadFacility = useCallback(async () => {
    if (!perms) return
    setError(null)
    const tasks: Promise<void>[] = []
    if (perms.canViewConsentCoverage) tasks.push(fetchConsentCoverage().then(setCoverage).catch(() => undefined))
    if (perms.canViewPendingDeletions) tasks.push(fetchPendingDeletions().then(setPending).catch(() => undefined))
    if (perms.canViewRetentionSla) tasks.push(fetchRetentionSla().then(setSla).catch(() => undefined))
    if (perms.canViewPolicyDiff) tasks.push(fetchPolicyDiff().then(setDiff).catch(() => undefined))
    if (perms.canDownloadRetentionExport) tasks.push(fetchRetentionExports().then(setExports).catch(() => undefined))
    await Promise.all(tasks)
  }, [perms])

  useEffect(() => {
    if (isPatient) fetchMyConsent().then(setMine).catch(() => undefined)
  }, [isPatient])

  useEffect(() => {
    if (canFacility) void loadFacility()
  }, [canFacility, loadFacility])

  useEffect(() => {
    const initial = params.get('session')
    if (initial) choose(initial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentSession = sessions.find((s) => s.id === sessionId)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Privacy"
        title="Data & Privacy"
        subtitle="Consent, retention and erasure — patient-controlled, audited, and never clinical. Nothing here diagnoses or prescribes."
      />

      <InfoBanner tone="brand">
        Consent and retention are administrative records, not clinical artifacts. Free-text reasons are anonymised before storage, and every
        action is audited.
      </InfoBanner>

      {error && <InfoBanner tone="rose">{error}</InfoBanner>}

      {isPatient && (
        <Stagger className="space-y-4">
          <StaggerItem>
            <Card title="Your consent records">
              <PatientConsentList records={mine} />
            </Card>
          </StaggerItem>
          <StaggerItem>
            <p className="text-[11px] text-ink-400">
              You can withdraw, re-grant or upgrade consent from each case page. Withdrawal erases the case immediately; a non-patient proof is
              kept.
            </p>
          </StaggerItem>
        </Stagger>
      )}

      {canCase && !isPatient && (
        <Card
          title="Case privacy"
          subtitle="Pick a case to inspect its consent, data inventory and retention timeline."
          action={
            <select
              value={sessionId}
              onChange={(e) => choose(e.target.value)}
              className="max-w-[240px] rounded-lg border border-ink-200 px-2 py-1.5 text-xs text-ink-800"
            >
              <option value="">Select a case…</option>
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.patientId ?? s.id}
                </option>
              ))}
            </select>
          }
        >
          {!sessionId ? (
            <p className="text-xs text-ink-400">No case selected.</p>
          ) : (
            <div className="space-y-5">
              {currentSession && (
                <p className="text-[11px] text-ink-500">
                  Selected case <span className="font-mono font-bold text-ink-700">{currentSession.patientId ?? currentSession.id}</span>
                </p>
              )}
              <ConsentStatusCard
                sessionId={sessionId}
                canWithdraw={Boolean(perms?.canWithdrawConsent)}
                canReGrant={Boolean(perms?.canReGrantConsent)}
                canUpgrade={Boolean(perms?.canUpgradeConsentVersion)}
                canReceipt={Boolean(perms?.canViewConsentHistory)}
              />
              {inventory && <SessionDataInventory inventory={inventory} />}
              {timeline && <RetentionTimeline timeline={timeline} />}
            </div>
          )}
        </Card>
      )}

      {canFacility && (
        <Stagger className="space-y-4">
          {coverage && (
            <StaggerItem>
              <ConsentCoverageCard coverage={coverage} />
            </StaggerItem>
          )}
          {perms?.canViewPendingDeletions && pending && (
            <StaggerItem>
              <PendingDeletionsTable pending={pending} />
            </StaggerItem>
          )}
          {perms?.canViewRetentionSla && sla && (
            <StaggerItem>
              <RetentionSlaCard sla={sla} canEdit={Boolean(perms.canViewRetentionSla)} onSaved={setSla} />
            </StaggerItem>
          )}
          {perms?.canViewPolicyDiff && diff && (
            <StaggerItem>
              <PolicyDiffTable diff={diff} />
            </StaggerItem>
          )}
          {perms?.canDownloadRetentionExport && (
            <StaggerItem>
              <RetentionExportsList exports={exports} canDownload={perms.canDownloadRetentionExport} />
            </StaggerItem>
          )}
        </Stagger>
      )}

      {(perms?.canRunBulkRetention || perms?.canPruneAudit) && (
        <Card title="Administrative controls" subtitle="Bulk retention and audit pruning. Both are audited and non-diagnostic.">
          <div className="flex flex-wrap gap-3">
            {perms?.canRunBulkRetention && (
              <Button variant="secondary" onClick={() => setBulkOpen(true)}>
                <Layers size={15} /> Run bulk retention
              </Button>
            )}
            {perms?.canPruneAudit && (
              <Button variant="danger" onClick={() => setPruneOpen(true)}>
                <Scissors size={14} /> Prune audit log
              </Button>
            )}
          </div>
        </Card>
      )}

      {perms?.canRunBulkRetention && (
        <BulkRetentionDialog
          open={bulkOpen}
          onClose={() => setBulkOpen(false)}
          sessionIds={sessions.map((s) => s.id)}
          onDone={() => void loadFacility()}
        />
      )}
      {perms?.canPruneAudit && <PruneAuditDialog open={pruneOpen} onClose={() => setPruneOpen(false)} onDone={() => undefined} />}

      {!isPatient && !canCase && !canFacility && !perms?.canRunBulkRetention && !perms?.canPruneAudit && (
        <Card title="No privacy tools for your role">
          <p className="text-xs text-ink-500">
            Data &amp; Privacy tools are available to patients (their own consent), clinicians (case inventory) and administrators (facility
            coverage and retention). {user ? `You are signed in as ${user.role}.` : ''}
          </p>
        </Card>
      )}
    </div>
  )
}
