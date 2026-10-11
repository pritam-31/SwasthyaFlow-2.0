import { AnimatePresence, motion } from 'framer-motion'
import { WifiOff } from 'lucide-react'
import { useOffline } from '../../context/OfflineContext'
import { OFFLINE_SECTION_LABELS } from '../../services/safetyPolicy'

type OfflineLang = 'en' | 'hi' | 'or'

/**
 * Full-width strip shown while the device is offline (or has work waiting).
 * Non-diagnostic by construction — it only reports connectivity state.
 */
export function OfflineBanner({ lang = 'en' }: { lang?: OfflineLang }) {
  const { online, pendingCount, failedCount, conflicts } = useOffline()
  const copy = OFFLINE_SECTION_LABELS[lang]
  const hasConflict = conflicts.length > 0
  const visible = !online || pendingCount > 0 || failedCount > 0 || hasConflict
  if (!visible) return null

  const tone = hasConflict || failedCount > 0 ? 'amber' : online ? 'brand' : 'amber'
  const message = !online
    ? copy.offlineBanner
    : hasConflict
      ? copy.conflictBody
      : pendingCount > 0
        ? copy.queuedForSync(pendingCount)
        : copy.failed

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        role="status"
        aria-live="polite"
        className={
          tone === 'amber'
            ? 'flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[12px] font-semibold text-amber-800'
            : 'flex items-center gap-2 border-b border-brand-100 bg-brand-50 px-4 py-2 text-[12px] font-semibold text-brand-800'
        }
      >
        <WifiOff size={14} className="shrink-0" />
        <span>{message}</span>
      </motion.div>
    </AnimatePresence>
  )
}

export type { OfflineLang }
