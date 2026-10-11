import { RefreshCw, ShieldCheck } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Badge, Button } from '../ui'
import { useApp } from '../../store/AppStore'
import { useAuth } from '../../context/AuthContext'
import { useTriage } from '../../context/TriageContext'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'
import { permissionsFor } from '../../services/rbacService'
import { AUDIT_SECTION_LABELS } from '../../services/safetyPolicy'
import { fetchAuditPaged, fetchChainMeta, verifyChain, verifyEntry } from '../../services/auditApi'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import type { AuditChainEntry, AuditChainMeta, AuditFilter, ChainVerificationResult, EntryVerificationResult } from '../../types/auditChain.types'
import { AuditFilterBar } from './AuditFilterBar'
import { AuditTable } from './AuditTable'
import { AuditDetailDrawer } from './AuditDetailDrawer'
import { ChainVerificationCard } from './ChainVerificationCard'
import { ChainMetaCard } from './ChainMetaCard'
import { AuditExportDialog } from './AuditExportDialog'

const PAGE_SIZE = 25

/**
 * The tamper-evident audit trail (P2-16): filter, page, inspect, verify a single
 * entry or the whole chain, and export an anonymised copy. The backend already
 * anonymises entries and never stores diagnosis, so this view is non-diagnostic.
 */
export function AuditChainPanel() {
  const { pushToast } = useApp()
  const { user, activeFacilityId } = useAuth()
  const { language } = useTriage()
  const online = useOnlineStatus()

  const facilityId = activeFacilityId ?? user?.facilityId ?? ''
  const perms = user ? permissionsFor(user.role) : null
  const langCode = CODE_BY_INTAKE_LANGUAGE[language] ?? 'en'
  const labels = useMemo(() => AUDIT_SECTION_LABELS[langCode], [langCode])

  const [draft, setDraft] = useState<AuditFilter>({ sort: 'desc' })
  const [active, setActive] = useState<AuditFilter>({ sort: 'desc' })
  const [cursors, setCursors] = useState<Array<string | undefined>>([undefined])

  const [items, setItems] = useState<AuditChainEntry[]>([])
  const [nextCursor, setNextCursor] = useState<string | null>(null)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [meta, setMeta] = useState<AuditChainMeta | null>(null)
  const [metaLoading, setMetaLoading] = useState(false)

  const [verification, setVerification] = useState<ChainVerificationResult | null>(null)
  const [verifying, setVerifying] = useState(false)

  const [selected, setSelected] = useState<AuditChainEntry | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [entryResult, setEntryResult] = useState<EntryVerificationResult | null>(null)
  const [entryVerifying, setEntryVerifying] = useState(false)

  const [exportOpen, setExportOpen] = useState(false)

  const cursor = cursors[cursors.length - 1]

  const load = useCallback(async () => {
    if (!facilityId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetchAuditPaged({ ...active, facilityId, cursor, limit: PAGE_SIZE })
      setItems(res.items)
      setNextCursor(res.nextCursor)
      setTotal(res.total)
    } catch (e) {
      setError(e instanceof Error ? e.message : labels.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [active, cursor, facilityId, labels.loadFailed])

  const loadMeta = useCallback(async () => {
    if (!facilityId) return
    setMetaLoading(true)
    try {
      setMeta(await fetchChainMeta(facilityId))
    } catch {
      /* meta is advisory — a failed read simply leaves the card empty */
    } finally {
      setMetaLoading(false)
    }
  }, [facilityId])

  useEffect(() => {
    void load()
  }, [load])
  useEffect(() => {
    void loadMeta()
  }, [loadMeta])

  const apply = (): void => {
    setActive({ ...draft })
    setCursors([undefined])
  }

  const reset = (): void => {
    const empty: AuditFilter = { sort: 'desc' }
    setDraft(empty)
    setActive(empty)
    setCursors([undefined])
  }

  const refresh = (): void => {
    void load()
    void loadMeta()
  }

  const verify = async (): Promise<void> => {
    if (!facilityId) return
    setVerifying(true)
    try {
      const result = await verifyChain(facilityId)
      setVerification(result)
      pushToast(result.valid ? 'success' : 'warning', result.valid ? labels.chainValid : labels.chainInvalid)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : labels.offline)
    } finally {
      setVerifying(false)
    }
  }

  const openEntry = (entry: AuditChainEntry): void => {
    setSelected(entry)
    setEntryResult(null)
    setDrawerOpen(true)
  }

  const verifyOne = async (sequenceNumber: number): Promise<void> => {
    if (!facilityId) return
    setEntryVerifying(true)
    try {
      setEntryResult(await verifyEntry(facilityId, sequenceNumber))
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : labels.offline)
    } finally {
      setEntryVerifying(false)
    }
  }

  if (!user || !perms?.canViewAudit || user.role === 'patient') return null

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        <ChainMetaCard labels={labels} meta={meta} loading={metaLoading} />
        <ChainVerificationCard
          labels={labels}
          verification={verification}
          verifying={verifying}
          canVerify={perms.canVerifyAuditChain}
          offline={!online}
          onVerify={verify}
        />
      </div>

      {!online && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-900">{labels.offline}</div>
      )}
      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50/70 px-4 py-3 text-xs text-rose-800">
          {labels.loadFailed} {error}
        </div>
      )}

      <div className="rounded-2xl border border-ink-200/70 bg-white/80 p-4">
        <AuditFilterBar labels={labels} value={draft} onChange={setDraft} onApply={apply} onReset={reset} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge className="bg-ink-100 text-ink-600 ring-ink-200">
          {total} {labels.total}
        </Badge>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            {loading ? labels.refreshing : labels.refresh}
          </Button>
          {perms.canExportAudit && (
            <Button size="sm" onClick={() => setExportOpen(true)} disabled={!online}>
              <ShieldCheck size={14} /> {labels.export}
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-ink-200/70 bg-white/80">
        {loading && items.length === 0 ? (
          <p className="p-6 text-center text-xs text-ink-400">{labels.refreshing}</p>
        ) : (
          <AuditTable labels={labels} entries={items} selectedId={selected?.id} onSelect={openEntry} />
        )}
      </div>

      <div className="flex items-center justify-between">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCursors((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev))}
          disabled={cursors.length <= 1 || loading}
        >
          {labels.previous}
        </Button>
        <span className="text-[11px] font-semibold text-ink-400">
          {labels.pageLabel} {cursors.length}
        </span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setCursors((prev) => (nextCursor ? [...prev, nextCursor] : prev))}
          disabled={!nextCursor || loading}
        >
          {labels.next}
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-ink-400">{labels.disclaimer}</p>

      <AuditDetailDrawer
        labels={labels}
        entry={selected}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onVerify={verifyOne}
        verifying={entryVerifying}
        result={entryResult}
        canVerify={perms.canVerifyAuditChain}
      />

      <AuditExportDialog
        labels={labels}
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        filter={{ ...active, facilityId }}
        onExported={() => void loadMeta()}
      />
    </div>
  )
}
