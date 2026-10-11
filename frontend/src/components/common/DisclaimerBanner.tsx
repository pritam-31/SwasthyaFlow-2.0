import { ShieldAlert } from 'lucide-react'
import { NON_DIAGNOSTIC_SHORT, NON_DIAGNOSTIC_STATEMENT } from '../../services/safetyPolicy'
import { cx } from '../ui'

/**
 * Global non-diagnostic notice. Rendered by the app layout so it is visible on
 * every screen — intake, queue, review, referral and audit alike.
 */
export function DisclaimerBanner({
  compact = false,
  className,
}: {
  compact?: boolean
  className?: string
}) {
  return (
    <div
      role="note"
      aria-label="Non-diagnostic system notice"
      className={cx(
        'mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300/70 bg-amber-50/80 px-3.5 py-2.5',
        className,
      )}
    >
      <ShieldAlert size={16} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
      <p className="text-[11px] leading-relaxed text-amber-900 sm:text-xs">
        <span className="mr-1.5 rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
          Non-diagnostic
        </span>
        {compact ? NON_DIAGNOSTIC_SHORT : NON_DIAGNOSTIC_STATEMENT}
      </p>
    </div>
  )
}
