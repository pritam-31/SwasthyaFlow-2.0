import { useCallback, useEffect, useState } from 'react'
import { BadgeCheck, CalendarClock, Download, ShieldOff, Trash2 } from 'lucide-react'
import { useTriage } from '../../context/TriageContext'
import { RETENTION_SECTION_LABELS } from '../../services/safetyPolicy'
import { CODE_BY_INTAKE_LANGUAGE, type LanguageCode } from '../../types/language.types'
import type { PatientSession } from '../../types/triage'
import type { ConsentRecord, RetentionExport } from '../../types/retention.types'
import { Badge, Button, Card, cx, Modal } from '../ui'
import DeleteConfirmDialog from './DeleteConfirmDialog'
import RetentionDisclaimer from './RetentionDisclaimer'

/**
 * Per-case consent + retention panel (P0-6). Shows the consent proof that
 * outlives the case, and the retention controls available to the current role.
 * Revoking consent or deleting the case erases it immediately from the backend;
 * a deletion proof (no patient data) is retained.
 */
export default function ConsentRetentionCard({ session }: { session: PatientSession }) {
  const {
    permissions,
    fetchSessionConsent,
    revokeSessionConsent,
    deleteSessionData,
    exportSession,
    extendSessionRetention,
  } = useTriage()
  const language: LanguageCode = (CODE_BY_INTAKE_LANGUAGE[session.raw.language] ?? 'en') as LanguageCode
  const t = RETENTION_SECTION_LABELS[language]

  const [consent, setConsent] = useState<ConsentRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [revokeOpen, setRevokeOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [exported, setExported] = useState<RetentionExport | null>(null)
  const [extendDays, setExtendDays] = useState(90)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setLoading(true)
    fetchSessionConsent(session.id)
      .then((record) => {
        if (alive) setConsent(record)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [session.id, fetchSessionConsent])

  const doRevoke = useCallback(
    async (reason: string) => {
      setBusy(true)
      const ok = await revokeSessionConsent(session.id, reason)
      setBusy(false)
      setRevokeOpen(false)
      setNotice(ok ? 'Consent withdrawn — the case was erased and the consent proof retained.' : 'Could not withdraw consent.')
    },
    [revokeSessionConsent, session.id],
  )

  const doDelete = useCallback(
    async (reason: string) => {
      setBusy(true)
      const ok = await deleteSessionData(session.id, reason)
      setBusy(false)
      setDeleteOpen(false)
      setNotice(ok ? 'Case erased — a deletion proof (no patient data) was retained.' : 'Could not erase the case.')
    },
    [deleteSessionData, session.id],
  )

  const doExport = useCallback(async () => {
    setBusy(true)
    const payload = await exportSession(session.id)
    setBusy(false)
    if (payload) setExported(payload)
    else setNotice('Could not build the export.')
  }, [exportSession, session.id])

  const doExtend = useCallback(async () => {
    setBusy(true)
    const ok = await extendSessionRetention(session.id, extendDays)
    setBusy(false)
    setNotice(ok ? `Retention extended by ${extendDays} day(s).` : 'Could not extend retention.')
  }, [extendDays, extendSessionRetention, session.id])

  const revoked = Boolean(consent?.revokedAt)

  return (
    <Card title={t.title} subtitle={t.subtitle}>
      <div className="space-y-4">
        <RetentionDisclaimer language={language} />

        {notice && (
          <p role="status" className="rounded-lg bg-ink-50 px-3 py-2 text-[11px] text-ink-600">
            {notice}
          </p>
        )}

        {loading ? (
          <p className="text-xs text-ink-400">Loading consent proof…</p>
        ) : !consent ? (
          <p className="text-sm text-ink-500">{t.noConsent}</p>
        ) : (
          <div className="rounded-xl border border-ink-200 p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge
                className={cx(
                  'ring-inset',
                  revoked
                    ? 'bg-rose-50 text-rose-700 ring-rose-200'
                    : 'bg-emerald-50 text-emerald-700 ring-emerald-200',
                )}
                icon={<BadgeCheck size={12} />}
              >
                {t.consentHeading} · {consent.consentRecordId}
              </Badge>
              <span className="font-mono text-[10px] text-ink-400">{t.policyVersion} {consent.policyVersion}</span>
            </div>
            <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-[11px] sm:grid-cols-2">
              <div>
                <dt className="font-semibold text-ink-400">{t.grantedAt}</dt>
                <dd className="text-ink-700">{new Date(consent.grantedAt).toLocaleString('en-IN')}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink-400">{t.grantedBy}</dt>
                <dd className="text-ink-700">
                  {consent.grantedBy} ({consent.grantedByRole})
                </dd>
              </div>
              {revoked && consent.revokedAt && (
                <>
                  <div>
                    <dt className="font-semibold text-ink-400">{t.revokedAt}</dt>
                    <dd className="text-ink-700">{new Date(consent.revokedAt).toLocaleString('en-IN')}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-400">{t.revokedBy}</dt>
                    <dd className="text-ink-700">
                      {consent.revokedBy} ({consent.revokedByRole})
                    </dd>
                  </div>
                </>
              )}
            </dl>
            <div className="mt-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{t.purposesHeading}</p>
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-[11px] text-ink-600">
                {consent.purposes.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {permissions.canRevokeConsent && !revoked && (
            <Button variant="danger" size="sm" onClick={() => setRevokeOpen(true)} disabled={busy}>
              <ShieldOff size={14} /> {t.revoke}
            </Button>
          )}
          {permissions.canDeleteData && (
            <Button variant="secondary" size="sm" onClick={() => setDeleteOpen(true)} disabled={busy}>
              <Trash2 size={14} /> {t.deleteData}
            </Button>
          )}
          {permissions.canExportData && (
            <Button variant="secondary" size="sm" onClick={doExport} disabled={busy}>
              <Download size={14} /> {t.exportData}
            </Button>
          )}
          {permissions.canExtendRetention && (
            <span className="inline-flex items-center gap-1.5">
              <label htmlFor="extend-days" className="text-[11px] font-semibold text-ink-500">
                {t.extendDays}
              </label>
              <input
                id="extend-days"
                type="number"
                min={1}
                max={3650}
                value={extendDays}
                onChange={(e) => setExtendDays(Number(e.target.value))}
                className="w-20 rounded-lg border border-ink-200 bg-white px-2 py-1 text-xs text-ink-700 outline-none focus:border-brand-500"
              />
              <Button variant="secondary" size="sm" onClick={doExtend} disabled={busy} title={t.extendHint}>
                <CalendarClock size={14} /> {t.extend}
              </Button>
            </span>
          )}
        </div>

        <p className="text-[11px] text-ink-400">{t.deleteHint}</p>
      </div>

      <DeleteConfirmDialog
        open={revokeOpen}
        onClose={() => setRevokeOpen(false)}
        title={t.revoke}
        message={t.revokeConfirm}
        confirmLabel={t.confirmRevoke}
        reasonLabel={t.revokeReason}
        reasonPlaceholder={t.revokePlaceholder}
        busy={busy}
        onConfirm={doRevoke}
      />

      <DeleteConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        title={t.deleteData}
        message={t.deleteHint}
        confirmLabel={t.deleteData}
        reasonLabel={t.revokeReason}
        busy={busy}
        onConfirm={doDelete}
      />

      <Modal open={Boolean(exported)} onClose={() => setExported(null)} title={t.exportData} wide>
        {exported && (
          <div className="space-y-3">
            <p className="text-xs text-ink-500">{exported.disclaimer}</p>
            <pre className="max-h-80 overflow-auto rounded-lg bg-ink-900 p-4 text-[11px] leading-relaxed text-emerald-300">
              {JSON.stringify(exported, null, 2)}
            </pre>
            <div className="flex justify-end">
              <Button
                onClick={() => {
                  const blob = new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `${exported.patientId}-retention-export.json`
                  a.click()
                  URL.revokeObjectURL(url)
                }}
              >
                <Download size={14} /> Download .json
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  )
}
