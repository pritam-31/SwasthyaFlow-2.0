import type { ReactNode } from 'react'
import { useOffline } from '../../context/OfflineContext'
import { OFFLINE_SECTION_LABELS } from '../../services/safetyPolicy'

type OfflineLang = 'en' | 'hi' | 'or'

/**
 * Wraps an action control and makes its offline behaviour explicit:
 *  - online-only actions (uploads, exports, binary work) are disabled with a
 *    clear "requires connection" note;
 *   - queueable actions get a soft hint that the change will sync later.
 *
 * It never changes the wrapped control's own behaviour or styling contract.
 */
export function OfflineActionWrapper({
  children,
  requiresConnection = false,
  lang = 'en',
}: {
  children: ReactNode
  requiresConnection?: boolean
  lang?: OfflineLang
}) {
  const { online } = useOffline()
  const copy = OFFLINE_SECTION_LABELS[lang]

  if (requiresConnection && !online) {
    return (
      <div className="space-y-1">
        <div className="pointer-events-none opacity-50" aria-disabled="true">
          {children}
        </div>
        <p className="text-[10px] font-semibold text-amber-700">{copy.requiresConnection}</p>
      </div>
    )
  }

  return (
    <div className="space-y-1">
      {children}
      {!online && <p className="text-[10px] font-semibold text-brand-700">{copy.willQueueOffline}</p>}
    </div>
  )
}
