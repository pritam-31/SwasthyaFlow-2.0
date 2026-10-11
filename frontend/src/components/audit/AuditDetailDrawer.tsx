import { CheckCircle2, ShieldAlert, ShieldCheck } from 'lucide-react'
import { Badge, Button, Modal } from '../ui'
import { PrunedEntryBadge } from './PrunedEntryBadge'
import { formatAuditTime } from '../../lib/format'
import type { AuditSectionLabels } from '../../services/safetyPolicy'
import type { AuditChainEntry, EntryVerificationResult } from '../../types/auditChain.types'

interface Props {
  labels: AuditSectionLabels
  entry: AuditChainEntry | null
  open: boolean
  onClose: () => void
  onVerify: (sequenceNumber: number) => void
  verifying: boolean
  result: EntryVerificationResult | null
  canVerify: boolean
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5 py-2 sm:flex-row sm:gap-3">
      <dt className="w-44 shrink-0 text-[11px] font-semibold text-ink-400">{label}</dt>
      <dd className={mono ? 'break-all font-mono text-[10px] text-ink-500' : 'text-xs text-ink-700'}>{value}</dd>
    </div>
  )
}

/** Detail drawer for one chained entry, with an optional per-entry verification. */
export function AuditDetailDrawer({ labels, entry, open, onClose, onVerify, verifying, result, canVerify }: Props) {
  if (!entry) return null
  return (
    <Modal open={open} onClose={onClose} title={`#${entry.sequenceNumber} · ${entry.action}`}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge className="bg-ink-100 text-ink-600 ring-ink-200">{entry.category}</Badge>
          <Badge className="bg-sky-50 text-sky-700 ring-sky-200">{entry.role}</Badge>
          {entry.pruned && <PrunedEntryBadge labels={labels} />}
        </div>

        <dl className="divide-y divide-ink-100">
          <Row label={labels.when} value={formatAuditTime(entry.at)} />
          <Row label={labels.actorRole} value={`${entry.actor} · ${entry.role}`} />
          <Row label={labels.sessionId} value={entry.sessionId} />
          <Row label="Facility" value={entry.facilityId} />
          <Row label={labels.detail} value={entry.detail} />
          <Row label={labels.hash} value={entry.hash} mono />
          <Row label="Previous hash" value={entry.previousHash} mono />
          <Row label="Algorithm" value={entry.hashAlgorithm} />
          {entry.pruned && entry.retentionRule ? <Row label="Retention rule" value={entry.retentionRule} /> : null}
          {entry.pruned && entry.prunedBy ? <Row label="Pruned by" value={entry.prunedBy} /> : null}
        </dl>

        {canVerify && (
          <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-3">
            <Button size="sm" variant="secondary" onClick={() => onVerify(entry.sequenceNumber)} disabled={verifying}>
              <ShieldCheck size={14} /> {labels.verifyEntry}
            </Button>
            {result && (
              <span
                className={
                  result.valid
                    ? 'inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700'
                    : 'inline-flex items-center gap-1.5 text-xs font-semibold text-rose-700'
                }
              >
                {result.valid ? <CheckCircle2 size={14} /> : <ShieldAlert size={14} />}
                {result.valid ? labels.entryValid : `${labels.entryInvalid} ${result.reason ?? ''}`}
              </span>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
