import { useEffect, useState } from 'react'
import { Database, FileClock, FileX2, ShieldCheck } from 'lucide-react'
import { useTriage } from '../../context/TriageContext'
import { Card } from '../ui'
import RetentionActionsTable from './RetentionActionsTable'
import RetentionDisclaimer from './RetentionDisclaimer'
import RetentionPolicyEditor from './RetentionPolicyEditor'
import RetentionPolicyTable from './RetentionPolicyTable'
import RetentionRunButton from './RetentionRunButton'
import RetentionStatusTable from './RetentionStatusTable'
import TombstoneList from './TombstoneList'

/**
 * Admin retention console (P0-6): edit the policy, inspect the inventory, run a
 * sweep, review the action history and the deletion proofs. Doctors see a
 * read-only policy; all data is backend-owned.
 */
export default function RetentionAdminSection() {
  const {
    permissions,
    retentionPolicy,
    retentionActions,
    retentionTombstones,
    retentionStatus,
    retentionLoading,
    refreshRetention,
    refreshRetentionStatus,
    saveRetentionPolicyRules,
    runRetentionJob,
  } = useTriage()
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void refreshRetention()
    void refreshRetentionStatus()
  }, [refreshRetention, refreshRetentionStatus])

  if (!permissions.canViewRetentionPolicy) return null

  return (
    <>
      <Card
        title="Retention policy"
        subtitle="One configurable rule per data category. Days are counted from each record's own timestamp; a disabled rule keeps data forever."
      >
        <div className="space-y-4">
          <RetentionDisclaimer />
          {!retentionPolicy ? (
            <p className="text-sm text-ink-500">{retentionLoading ? 'Loading policy…' : 'Policy unavailable.'}</p>
          ) : permissions.canEditRetentionPolicy ? (
            <RetentionPolicyEditor
              policy={retentionPolicy}
              saving={saving}
              onSave={async (rules) => {
                setSaving(true)
                const ok = await saveRetentionPolicyRules(rules)
                setSaving(false)
                return ok
              }}
            />
          ) : (
            <RetentionPolicyTable policy={retentionPolicy} />
          )}
          {retentionPolicy && (
            <p className="text-[11px] text-ink-400">
              Policy {retentionPolicy.version} · updated {new Date(retentionPolicy.updatedAt).toLocaleString('en-IN')} by{' '}
              {retentionPolicy.updatedBy}
            </p>
          )}
        </div>
      </Card>

      {permissions.canRunRetentionJob && (
        <Card
          title="Retention inventory & sweep"
          subtitle="What is currently held and what is due. The scheduler runs the same engine automatically."
        >
          <div className="space-y-4">
            <RetentionRunButton running={retentionLoading} onRun={(mode) => runRetentionJob(mode)} />
            {retentionStatus.length > 0 ? (
              <RetentionStatusTable status={retentionStatus} />
            ) : (
              <p className="text-xs text-ink-400">Loading inventory…</p>
            )}
          </div>
        </Card>
      )}

      {permissions.canViewRetentionActions && (
        <Card
          title="Retention history"
          subtitle="Every destructive pass and policy change is recorded — retention is evidence, not silence."
        >
          <RetentionActionsTable actions={retentionActions} />
        </Card>
      )}

      {permissions.canRunRetentionJob && (
        <Card title="Deletion proof" subtitle="Tombstones attest to erased cases without holding any patient data.">
          <TombstoneList tombstones={retentionTombstones} />
        </Card>
      )}

      <div className="flex items-center gap-2 text-[11px] text-ink-400">
        <Database size={13} />
        <FileClock size={13} />
        <FileX2 size={13} />
        <ShieldCheck size={13} className="text-brand-600" />
        Retention is scheduled, consent-linked and fully audited. Nothing here diagnoses.
      </div>
    </>
  )
}
