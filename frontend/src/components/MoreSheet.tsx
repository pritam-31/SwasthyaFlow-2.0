import { AnimatePresence, motion } from 'framer-motion'
import { LogOut, ShieldCheck, X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../store/AppStore'
import { NAV_ITEMS, ROLE_LABEL } from './navItems'
import { cx } from './ui'

/**
 * Mobile "More" bottom sheet. Lists every section not pinned to the bottom
 * bar in a 3-column grid (role-filtered, matching the desktop rail) plus the
 * signed-in account with a sign-out action. Slides up with a spring, closes
 * via backdrop tap, swipe-down, title and the X button.
 */
export function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { role } = useApp()
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const sheetRef = useRef<HTMLDivElement>(null)

  const items = NAV_ITEMS.filter((n) => !n.bottom && !n.center && n.roles.includes(role))

  const go = (to: string) => {
    navigate(to)
    onClose()
  }

  const signOut = () => {
    onClose()
    void logout()
  }

  // Lock background scroll, close on Escape and keep Tab focus inside the sheet.
  useEffect(() => {
    if (!open) return
    const previouslyFocused = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
        return
      }
      if (e.key !== 'Tab') return
      const focusables = sheetRef.current?.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (!focusables || focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKey)
    const focusTimer = window.setTimeout(() => sheetRef.current?.querySelector<HTMLElement>('button')?.focus(), 40)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      window.clearTimeout(focusTimer)
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            className="fixed inset-0 z-[48] bg-ink-900/45 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label="More sections"
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 120 || info.velocity.y > 600) onClose()
            }}
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 38 }}
            style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            className="fixed inset-x-0 bottom-0 z-[49] rounded-t-3xl bg-white shadow-[0_-20px_60px_-20px_rgba(16,24,40,0.4)]"
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-ink-200" />

            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <p className="text-[15px] font-extrabold tracking-tight text-ink-900">More</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-xl bg-ink-100 text-ink-600 transition-colors hover:bg-ink-200/70 active:scale-90"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-4 pt-2">
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">All sections</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {items.map((n) => {
                  const Icon = n.icon
                  const active = n.to === location.pathname
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => go(n.to)}
                      className={cx(
                        'sf-nav-item flex min-h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl border py-3.5 outline-none transition-all duration-150 active:scale-95 focus-visible:ring-2 focus-visible:ring-brand-500',
                        active
                          ? 'border-brand-200 bg-brand-50 text-brand-700'
                          : 'border-ink-100 bg-white text-ink-500 hover:border-ink-200 hover:text-ink-800',
                      )}
                    >
                      <Icon size={20} strokeWidth={active ? 2.4 : 1.9} />
                      <span
                        className={cx(
                          'text-center text-[11px] leading-tight',
                          active ? 'font-bold' : 'font-semibold',
                        )}
                      >
                        {n.label}
                      </span>
                    </button>
                  )
                })}
              </div>

              <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-ink-400">Account</p>
              <div className="mt-2 flex items-center justify-between gap-3 rounded-2xl bg-ink-100/80 px-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-ink-900">
                    {user?.displayName ?? 'Signed out'}
                  </p>
                  <p className="flex items-center gap-1 truncate text-[11px] font-semibold text-ink-500">
                    <ShieldCheck size={11} className="shrink-0 text-lime-600" />
                    {ROLE_LABEL[role]}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={signOut}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-rose-600 ring-1 ring-inset ring-rose-200 transition-colors hover:bg-rose-50 active:scale-95"
                >
                  <LogOut size={13} /> Sign out
                </button>
              </div>
            </div>

            <div className="h-2" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}