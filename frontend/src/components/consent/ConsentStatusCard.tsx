import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, Download, FileText, RotateCcw, ShieldAlert, ShieldCheck, Sparkles } from 'lucide-react'
import { Badge, Button, Card } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { useApp } from '../../store/AppStore'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import {
  fetchConsentHistory,
  fetchSessionConsent,
  generateConsentReceipt,
  reGrantConsent,
  upgradeConsentVersion,
} from '../../services/consentApi'
import { fetchBlobUrl } from '../../services/api'
import { ConsentHistoryTimeline } from './ConsentHistoryTimeline'
import { ConsentWithdrawDialog } from './ConsentWithdrawDialog'
import type { ConsentRecord } from '../../types/retention.types'
import type { ConsentHistoryEntry } from '../../types/consent.types'

export function ConsentStatusCard({
  sessionId,
  canWithdraw,
  canReGrant,
  canUpgrade,
  canReceipt,
}: {
  sessionId: string
  canWithdraw: boolean
  canReGrant: boolean
  canUpgrade: boolean
  canReceipt: boolean
}) {
  const { language } = useTriage()
  const { pushToast } = useApp()
  const labels = CONSENT_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]

  const [consent, setConsent] = useState<ConsentRecord | null>(null)
  const [history, setHistory] = useState<ConsentHistoryEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)

  const reload = useCallback(() => {
    fetchSessionConsent(sessionId).then(setConsent).catch(() => {})
    fetchConsentHistory(sessionId).then(setHistory).catch(() => {})
  }, [sessionId])

  useEffect(() => {
    reload()
  }, [reload])

  const state: 'granted' | 'revoked' | 'none' = !consent ? 'none' : consent.revokedAt ? 'revoked' : 'granted'
  const stateLabel = state === 'granted' ? labels.active : state === 'revoked' ? labels.withdrawn : labels.none
  const stateTone =
    state === 'granted'
      ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
      : state === 'revoked'
        ? 'bg-rose-50 text-rose-700 ring-rose-200'
        : 'bg-ink-100 text-ink-500 ring-ink-200'

  async function reGrant() {
    setBusy(true)
    try {
      await reGrantConsent(sessionId)
      pushToast('success', labels.reGrant)
      reload()
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Could not re-grant consent.')
    } finally {
      setBusy(false)
    }
  }

  async function upgrade() {
    setBusy(true)
    try {
      await upgradeConsentVersion(sessionId)
      pushToast('success', labels.upgrade)
      reload()
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Could not upgrade consent.')
    } finally {
      setBusy(false)
    }
  }

  async function downloadReceipt() {
    setBusy(true)
    try {
      const receipt = await generateConsentReceipt(sessionId)
      const url = await fetchBlobUrl(`/consent/receipt/${encodeURIComponent(receipt.ref)}`)
      const a = document.createElement('a')
      a.href = url
      a.download = `consent-receipt-${receipt.ref}.json`
      a.click()
      URL.revokeObjectURL(url)
      pushToast('success', labels.receipt)
    } catch (e) {
      pushToast('error', e instanceof Error ? e.message : 'Could not build the receipt.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card
      title={
        <>
          <ShieldCheck size={15} className="text-brand-600" /> {labels.statusHeading}
        </>
      }
      subtitle={labels.subtitle}
      action={
        <Badge className={stateTone} icon={state === 'granted' ? <BadgeCheck size={12} /> : <ShieldAlert size={12} />}>
          {stateLabel}
        </Badge>
      }
    >
      <div className="space-y-4">
        {consent ? (
          <dl className="grid gap-3 text-xs sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-ink-500">{labels.grantedAt}</dt>
              <dd className="text-ink-800">{formatAuditTime(consent.grantedAt)}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-500">{labels.grantedBy}</dt>
              <dd className="text-ink-800">
                {consent.grantedBy} ({consent.grantedByRole})
              </dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-500">{labels.policyVersion}</dt>
              <dd className="text-ink-800">{consent.policyVersion}</dd>
            </div>
            {consent.revokedAt && (
              <div>
                <dt className="font-semibold text-ink-500">{labels.withdrawnAt}</dt>
                <dd className="text-ink-800">{formatAuditTime(consent.revokedAt)}</dd>
              </div>
            )}
            <div className="sm:col-span-2">
              <dt className="font-semibold text-ink-500">{labels.purposesHeading}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {consent.purposes.map((p) => (
                  <Badge key={p} className="bg-brand-50 text-brand-700 ring-brand-200">
                    {p}
                  </Badge>
                ))}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-xs text-ink-400">{labels.none}</p>
        )}

        <div className="flex flex-wrap gap-2">
          {canWithdraw && state === 'granted' && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => setDialogOpen(true)}>
              <ShieldAlert size={14} /> {labels.withdraw}
            </Button>
          )}
          {canReGrant && state === 'revoked' && (
            <Button variant="success" size="sm" disabled={busy} onClick={reGrant}>
              <RotateCcw size={14} /> {labels.reGrant}
            </Button>
          )}
          {canUpgrade && state === 'granted' && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={upgrade} title={labels.upgradeHint}>
              <Sparkles size={14} /> {labels.upgrade}
            </Button>
          )}
          {canReceipt && consent && (
            <Button variant="secondary" size="sm" disabled={busy} onClick={downloadReceipt} title={labels.receiptHint}>
              <Download size={14} /> {labels.receipt}
            </Button>
          )}
          {!canWithdraw && !canReGrant && !canUpgrade && !canReceipt && (
            <p className="text-[11px] text-ink-400">{labels.patientOnly}</p>
          )}
        </div>

        <div className="border-t border-ink-100 pt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-ink-700">
            <FileText size={13} /> {labels.historyHeading}
          </p>
          <ConsentHistoryTimeline events={history} />
        </div>
      </div>

      <ConsentWithdrawDialog
        open={dialogOpen}
        sessionId={sessionId}
        onClose={() => setDialogOpen(false)}
        onDone={() => reload()}
      />
    </Card>
  )
}
