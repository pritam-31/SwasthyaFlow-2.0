import { AlertTriangle, Cloud, CloudOff, RefreshCw } from 'lucide-react'
import { useOffline } from '../../context/OfflineContext'
import { OFFLINE_SECTION_LABELS } from '../../services/safetyPolicy'

type OfflineLang = 'en' | 'hi' | 'or'

/**
 * Compact connectivity/sync chip for the app header. Clicking it opens the
 * offline queue panel (wired by the parent). Never shows clinical content.
 */
export function SyncStatusIndicator({ lang = 'en', onOpen }: { lang?: OfflineLang; onOpen: () => void }) {
  const { online, syncing, pendingCount, failedCount, conflicts } = useOffline()
  const copy = OFFLINE_SECTION_LABELS[lang]

  let label = online ? copy.indicatorOnline : copy.indicatorOffline
  let tone = online ? 'text-emerald-600' : 'text-amber-600'
  let Icon = online ? Cloud : CloudOff

  if (syncing) {
    label = copy.indicatorSyncing
    tone = 'text-brand-600'
    Icon = RefreshCw
  } else if (conflicts.length > 0) {
    label = copy.indicatorConflicts(conflicts.length)
    tone = 'text-amber-600'
    Icon = AlertTriangle
  } else if (failedCount > 0) {
    label = copy.failed
    tone = 'text-amber-600'
    Icon = AlertTriangle
  } else if (pendingCount > 0) {
    label = copy.indicatorPending(pendingCount)
    tone = 'text-brand-600'
    Icon = RefreshCw
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      title={copy.queueTitle}
      aria-label={`${copy.queueTitle} — ${label}`}
      className="flex items-center gap-1.5 rounded-full border border-ink-200 bg-white/70 px-3 py-1.5 text-[11px] font-bold text-ink-700 transition-colors hover:bg-white"
    >
      <Icon size={13} className={`${tone} ${syncing ? 'animate-spin' : ''}`} />
      <span className={tone}>{label}</span>
    </button>
  )
}
