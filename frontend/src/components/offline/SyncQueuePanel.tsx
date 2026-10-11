import { AnimatePresence, motion } from 'framer-motion'
import { RefreshCw, Trash2, Wifi, WifiOff, X } from 'lucide-react'
import { useOffline } from '../../context/OfflineContext'
import { OFFLINE_SECTION_LABELS } from '../../services/safetyPolicy'
import type { QueueStatus } from '../../types/sync.types'
import { ConflictResolver } from './ConflictResolver'

type OfflineLang = 'en' | 'hi' | 'or'

const STATUS_TONE: Record<QueueStatus, string> = {
  pending: 'bg-brand-50 text-brand-700 border-brand-100',
  'in-flight': 'bg-brand-50 text-brand-700 border-brand-100',
  failed: 'bg-amber-50 text-amber-700 border-amber-200',
  conflict: 'bg-amber-50 text-amber-700 border-amber-200',
  synced: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  abandoned: 'bg-ink-100 text-ink-500 border-ink-200',
}

function statusLabel(status: QueueStatus, lang: OfflineLang): string {
  const copy = OFFLINE_SECTION_LABELS[lang]
  switch (status) {
    case 'failed':
      return copy.failed
    case 'conflict':
      return copy.needsDecision
    case 'synced':
      return copy.allSynced
    case 'abandoned':
      return copy.remove
    default:
      return copy.pending
  }
}

/** Slide-over panel listing the offline write queue and any conflicts. */
export function SyncQueuePanel({
  open,
  onClose,
  lang = 'en',
}: {
  open: boolean
  onClose: () => void
  lang?: OfflineLang
}) {
  const { online, syncing, queue, failedCount, pendingCount, conflicts, syncNow, resolveConflict, removeItem } = useOffline()
  const copy = OFFLINE_SECTION_LABELS[lang]
  const visible = queue.filter((i) => i.status !== 'synced')
  const retryable = queue.filter((i) => i.status === 'failed')

  const syncLabel = retryable.length > 0 ? copy.retryAll : syncing ? copy.syncing : pendingCount > 0 ? copy.syncNow : copy.allSynced

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-40 bg-ink-900/30 backdrop-blur-sm"
          />
          <motion.aside
            initial={{ x: 360, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 360, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 34 }}
            className="fixed right-0 top-0 z-50 flex h-full w-[min(92vw,360px)] flex-col border-l border-ink-100 bg-white shadow-2xl"
            role="dialog"
            aria-label={copy.queueTitle}
          >
            <header className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
              <div className="flex items-center gap-2 text-[13px] font-extrabold text-ink-900">
                {online ? <Wifi size={15} className="text-emerald-600" /> : <WifiOff size={15} className="text-amber-600" />}
                {copy.queueTitle}
              </div>
              <button
                type="button"
                onClick={onClose}
                aria-label={copy.close}
                className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-2">
              <span className="text-[11px] font-semibold text-ink-500">
                {online ? copy.indicatorOnline : copy.indicatorOffline}
                {failedCount > 0 ? ` · ${failedCount} ${copy.failed}` : ''}
              </span>
              <button
                type="button"
                disabled={!online || syncing || (pendingCount === 0 && retryable.length === 0)}
                onClick={() => void syncNow()}
                className="flex items-center gap-1.5 rounded-lg bg-brand-600 px-2.5 py-1.5 text-[11px] font-bold text-white disabled:opacity-40"
              >
                <RefreshCw size={12} className={syncing ? 'animate-spin' : ''} />
                {syncLabel}
              </button>
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-3">
              {visible.length === 0 && <p className="px-1 py-6 text-center text-[12px] text-ink-400">{copy.queueEmpty}</p>}

              {conflicts.map((item) => (
                <ConflictResolver key={item.id} item={item} lang={lang} />
              ))}

              {visible
                .filter((i) => i.status !== 'conflict')
                .map((item) => (
                  <div key={item.id} className="rounded-xl border border-ink-100 bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-[12px] font-bold text-ink-800">{item.actionType}</p>
                        <p className="truncate text-[10px] text-ink-400">{item.endpoint}</p>
                      </div>
                      <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${STATUS_TONE[item.status]}`}>
                        {statusLabel(item.status, lang)}
                      </span>
                    </div>
                    {item.lastError && <p className="mt-1 text-[10px] text-amber-700">{item.lastError}</p>}
                    <div className="mt-2 flex gap-2">
                      {item.status === 'failed' && (
                        <button
                          type="button"
                          onClick={() => void resolveConflict(item.id, 'keep-mine')}
                          className="rounded-lg border border-ink-200 bg-white px-2 py-1 text-[10px] font-bold text-ink-700 hover:bg-ink-50"
                        >
                          {copy.retry}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeItem(item.id)}
                        className="flex items-center gap-1 rounded-lg border border-amber-200 bg-white px-2 py-1 text-[10px] font-bold text-amber-700 hover:bg-amber-50"
                      >
                        <Trash2 size={11} />
                        {copy.remove}
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  )
}
