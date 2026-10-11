import { Scissors } from 'lucide-react'
import { Badge } from '../ui'
import type { AuditSectionLabels } from '../../services/safetyPolicy'

/**
 * Marks a retention-pruned audit entry. The content is gone but the chain link
 * is preserved, so the tombstone is still verifiable.
 */
export function PrunedEntryBadge({ labels, title }: { labels: AuditSectionLabels; title?: string }) {
  return (
    <Badge className="bg-ink-100 text-ink-500 ring-ink-200" icon={<Scissors size={11} />}>
      <span title={title ?? labels.prunedHint}>{labels.prunedBadge}</span>
    </Badge>
  )
}
