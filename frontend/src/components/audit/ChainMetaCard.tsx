import { Link2 } from 'lucide-react'
import { Card } from '../ui'
import { formatAuditTime } from '../../lib/format'
import type { AuditSectionLabels } from '../../services/safetyPolicy'
import type { AuditChainMeta } from '../../types/auditChain.types'

interface Props {
  labels: AuditSectionLabels
  meta: AuditChainMeta | null
  loading: boolean
}

/** The facility chain head: last sequence, head hash and entry count. */
export function ChainMetaCard({ labels, meta, loading }: Props) {
  return (
    <Card title={labels.metaTitle} action={<Link2 size={16} className="text-ink-400" />}>
      {loading && !meta ? (
        <p className="text-xs text-ink-400">{labels.refreshing}</p>
      ) : !meta ? (
        <p className="text-xs text-ink-400">{labels.loadFailed}</p>
      ) : (
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="font-semibold text-ink-400">{labels.lastSequence}</dt>
            <dd className="mt-0.5 text-lg font-extrabold text-ink-900">#{meta.lastSequenceNumber}</dd>
          </div>
          <div>
            <dt className="font-semibold text-ink-400">{labels.entryCount}</dt>
            <dd className="mt-0.5 text-lg font-extrabold text-ink-900">{meta.entryCount}</dd>
          </div>
          <div className="col-span-2">
            <dt className="font-semibold text-ink-400">{labels.lastHash}</dt>
            <dd className="mt-0.5 break-all font-mono text-[10px] text-ink-500">{meta.lastHash}</dd>
          </div>
          <div className="col-span-2">
            <dt className="font-semibold text-ink-400">{labels.updatedAt}</dt>
            <dd className="mt-0.5 text-ink-600">{formatAuditTime(meta.updatedAt)}</dd>
          </div>
        </dl>
      )}
    </Card>
  )
}
