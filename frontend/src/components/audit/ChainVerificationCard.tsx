import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Button, Card } from '../ui'
import { formatAuditTime } from '../../lib/format'
import type { AuditSectionLabels } from '../../services/safetyPolicy'
import type { ChainVerificationResult } from '../../types/auditChain.types'

interface Props {
  labels: AuditSectionLabels
  verification: ChainVerificationResult | null
  verifying: boolean
  canVerify: boolean
  offline: boolean
  onVerify: () => void
}

/** Verify the whole chain for the facility; shows the first invalid entry. */
export function ChainVerificationCard({ labels, verification, verifying, canVerify, offline, onVerify }: Props) {
  return (
    <Card
      title={labels.verifyChain}
      action={<ShieldCheck size={16} className="text-ink-400" />}
    >
      <div className="space-y-3">
        {verification ? (
          <div
            className={
              verification.valid
                ? 'flex items-start gap-2.5 rounded-xl border border-brand-200 bg-brand-50/70 px-3.5 py-3 text-xs text-brand-900'
                : 'flex items-start gap-2.5 rounded-xl border border-rose-200 bg-rose-50/70 px-3.5 py-3 text-xs text-rose-800'
            }
          >
            {verification.valid ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <ShieldAlert size={16} className="mt-0.5 shrink-0" />}
            <div className="space-y-1">
              <p className="font-bold">{verification.valid ? labels.chainValid : labels.chainInvalid}</p>
              <p>
                {labels.entriesChecked}: {verification.checkedEntries} · {labels.chainVerifiedAt}{' '}
                {formatAuditTime(verification.verifiedAt)}
              </p>
              {!verification.valid && verification.firstInvalidSequence !== undefined && (
                <p className="font-semibold">
                  {labels.firstInvalid} #{verification.firstInvalidSequence}
                  {verification.reason ? ` — ${verification.reason}` : ''}
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-xs text-ink-400">
            {offline ? labels.offline : labels.subtitle}
          </p>
        )}
        {canVerify && (
          <Button size="sm" onClick={onVerify} disabled={verifying || offline}>
            <ShieldCheck size={14} /> {verifying ? labels.verifying : labels.verifyChain}
          </Button>
        )}
      </div>
    </Card>
  )
}
