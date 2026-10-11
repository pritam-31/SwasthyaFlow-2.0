import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  FileText,
  Grid2X2,
  HeartPulse,
  Info,
  ListTodo,
  LogOut,
  Mic,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../store/AppStore'
import type { Role } from '../types'
import { DisclaimerBanner } from './common/DisclaimerBanner'
import { BottomNav } from './BottomNav'
import { MoreSheet } from './MoreSheet'
import { NAV_ITEMS, ROLE_LABEL } from './navItems'
import { cx, EASE } from './ui'
import { FacilitySwitcher } from './facility/FacilitySwitcher'

/* ------------------------------------------------------------------ */
/*  Account meta                                                       */
/* ------------------------------------------------------------------ */

const USER_META: Record<Role, { initials: string; name: string; tile: string }> = {
  patient: { initials: 'PT', name: 'Patient', tile: 'bg-sky-300' },
  nurse: { initials: 'RS', name: 'R. Sharma', tile: 'bg-sky-400' },
  doctor: { initials: 'AM', name: 'Dr. A. Mehta', tile: 'bg-violet-400' },
  admin: { initials: 'SK', name: 'S. Kiro', tile: 'bg-lime-400' },
  'system-admin': { initials: 'SA', name: 'System Admin', tile: 'bg-emerald-400' },
  'facility-admin': { initials: 'FA', name: 'Facility Admin', tile: 'bg-lime-400' },
}

/** Two-letter monogram for the signed-in account. */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('')
}

const QUICK_ACTIONS = [
  { label: 'New patient intake', hint: 'Voice, text or report', to: '/app/intake', icon: <Users size={16} /> },
  { label: 'Open triage queue', hint: 'Cases waiting on review', to: '/app/triage', icon: <ListTodo size={16} /> },
  { label: 'Start a health camp', hint: 'Rapid screening mode', to: '/app/camps', icon: <HeartPulse size={16} /> },
  { label: 'Approval queue', hint: 'Referral drafts waiting', to: '/app/referrals', icon: <FileText size={16} /> },
]

/* ------------------------------------------------------------------ */
/*  Toasts                                                             */
/* ------------------------------------------------------------------ */

export function ToastStack() {
  const { toasts, dismissToast } = useApp()
  const icons = {
    success: <CheckCircle2 size={16} className="text-emerald-500" />,
    info: <Info size={16} className="text-sky-500" />,
    warning: <AlertCircle size={16} className="text-amber-500" />,
    error: <AlertCircle size={16} className="text-rose-500" />,
  }
  return (
    <div className="pointer-events-none fixed bottom-24 right-4 z-[60] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-4">
      <AnimatePresence>
        {toasts.map((t) => (
          <motion.button
            key={t.id}
            onClick={() => dismissToast(t.id)}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 60, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 320, damping: 26 }}
            className="glass-card pointer-events-auto flex items-start gap-2.5 rounded-2xl p-3.5 text-left text-xs font-medium text-ink-700"
          >
            <motion.span
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 15, delay: 0.08 }}
            >
              {icons[t.kind]}
            </motion.span>
            <span className="flex-1">{t.text}</span>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Live clock                                                         */
/* ------------------------------------------------------------------ */

function useClock() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/* ------------------------------------------------------------------ */
/*  Icon sidebar                                                       */
/* ------------------------------------------------------------------ */

function RailButton({
  to,
  label,
  children,
  onNavigate,
}: {
  to: string
  label: string
  children: ReactNode
  onNavigate?: () => void
}) {
  return (
    <NavLink
      to={to}
      end={to === '/app'}
      onClick={onNavigate}
      title={label}
      aria-label={label}
      className={({ isActive }) =>
        cx(
          'group relative flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
          isActive ? 'text-white' : 'text-ink-500 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <motion.span
              layoutId="rail-active-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 -z-10 rounded-2xl bg-white/12 ring-1 ring-inset ring-white/15"
            />
          )}
          <span className="relative z-10 transition-transform duration-200 group-active:scale-90">{children}</span>
          <span
            className={cx(
              'pointer-events-none absolute left-[54px] z-50 hidden whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition-opacity lg:block',
              'group-hover:opacity-100',
            )}
          >
            {label}
          </span>
        </>
      )}
    </NavLink>
  )
}

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { role, offlineMode, setOfflineMode } = useApp()
  const { user: authUser, logout } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const moreRef = useRef<HTMLDivElement>(null)

  const primary = NAV_ITEMS.filter((n) => n.sidebar === 'primary' && n.roles.includes(role)).sort((a, b) => a.order - b.order)
  const overflow = NAV_ITEMS.filter((n) => n.sidebar === 'overflow' && n.roles.includes(role)).sort((a, b) => a.order - b.order)

  useEffect(() => {
    if (!moreOpen) return
    const onDown = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [moreOpen])

  return (
    <>
      <div className="flex flex-col items-center gap-3 pt-5">
        <motion.div
          whileHover={{ scale: 1.04 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
          className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-lg shadow-brand-900/30 ring-1 ring-inset ring-white/20"
          title="SwasthyaFlow AI"
        >
          <HeartPulse size={18} />
        </motion.div>

        <nav className="flex flex-col items-center gap-1.5">
          {primary.map((n, i) => (
            <motion.div
              key={n.to}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.3, ease: EASE }}
            >
              <RailButton to={n.to} label={n.label} onNavigate={onNavigate}>
                <n.icon size={19} />
              </RailButton>
            </motion.div>
          ))}

          {overflow.length > 0 && (
            <div className="relative" ref={moreRef}>
              <button
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-label="More sections"
                aria-expanded={moreOpen}
                title="More sections"
                className={cx(
                  'group flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
                  moreOpen ? 'bg-white/12 text-white ring-1 ring-inset ring-white/15' : 'text-ink-500 hover:bg-white/5 hover:text-white',
                )}
              >
                <Grid2X2 size={19} />
                <span
                  className={cx(
                    'pointer-events-none absolute left-[54px] z-50 hidden whitespace-nowrap rounded-lg bg-ink-900 px-2.5 py-1.5 text-[11px] font-bold text-white opacity-0 shadow-lg transition-opacity lg:block',
                    'group-hover:opacity-100',
                  )}
                >
                  More
                </span>
              </button>

              <AnimatePresence>
                {moreOpen && (
                  <motion.div
                    initial={{ opacity: 0, x: -8, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -8, scale: 0.96 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    className="glass-card absolute left-[52px] top-0 z-50 w-52 origin-top-left rounded-2xl p-1.5"
                  >
                    {overflow.map((n) => (
                      <NavLink
                        key={n.to}
                        to={n.to}
                        onClick={() => {
                          setMoreOpen(false)
                          onNavigate?.()
                        }}
                        className={({ isActive }) =>
                          cx(
                            'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold transition-colors',
                            isActive ? 'bg-ink-900 text-white' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900',
                          )
                        }
                      >
                        <span className="text-ink-400">
                          <n.icon size={16} />
                        </span>
                        {n.label}
                      </NavLink>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </nav>
      </div>

      <div className="mt-auto flex flex-col items-center gap-3 pb-5">
        <button
          type="button"
          onClick={() => setOfflineMode(!offlineMode)}
          title={offlineMode ? 'Reconnect' : 'Go offline'}
          aria-label={offlineMode ? 'Reconnect' : 'Go offline'}
          className="group relative flex h-10 w-10 items-center justify-center rounded-2xl text-ink-500 transition-colors hover:bg-white/5 hover:text-white"
        >
          {offlineMode ? (
            <WifiOff size={18} className="text-amber-400" />
          ) : (
            <Wifi size={18} className="text-emerald-400" />
          )}
          <span className="sr-only">Toggle connectivity</span>
        </button>

        <div className="h-px w-7 bg-white/10" />

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          onClick={() => void logout()}
          title={`${authUser?.displayName ?? USER_META[role].name} — sign out`}
          aria-label="Sign out"
          className={cx(
            'flex h-10 w-10 items-center justify-center rounded-2xl text-[12px] font-extrabold text-ink-900 ring-2 ring-white/15',
            USER_META[role].tile,
          )}
        >
          {authUser ? initialsOf(authUser.displayName) : USER_META[role].initials}
        </motion.button>
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Top navbar — quick actions + search + clock + role switcher         */
/* ------------------------------------------------------------------ */

function SearchPalette({ onClose }: { onClose: () => void }) {
  const { role } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = NAV_ITEMS.filter((n) => n.roles.includes(role))
    if (!q) return pool
    return pool.filter((n) => n.label.toLowerCase().includes(q) || n.to.includes(q))
  }, [query, role])

  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="glass-card absolute right-0 top-[calc(100%+10px)] z-50 w-[300px] rounded-2xl p-3 sm:w-[360px]"
    >
      <div className="flex items-center gap-2 rounded-xl bg-ink-100/80 px-3 py-2">
        <Search size={15} className="text-ink-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose()
            if (e.key === 'Enter' && results[0]) {
              navigate(results[0].to)
              onClose()
            }
          }}
          placeholder="Jump to a section…"
          className="w-full bg-transparent text-[13px] font-medium text-ink-800 outline-none placeholder:text-ink-400"
        />
        <button type="button" onClick={onClose} aria-label="Close search" className="text-ink-400 hover:text-ink-700">
          <X size={15} />
        </button>
      </div>

      <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto">
        {results.length === 0 && (
          <li className="px-2 py-6 text-center text-[12px] text-ink-400">No section matches “{query}”.</li>
        )}
        {results.map((n, i) => (
          <motion.li
            key={n.to}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.02 * i, duration: 0.2 }}
          >
            <button
              type="button"
              onClick={() => {
                navigate(n.to)
                onClose()
              }}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold text-ink-700 transition-colors hover:bg-ink-100 hover:text-ink-900"
            >
              <span className="text-ink-400">
                <n.icon size={15} />
              </span>
              {n.label}
            </button>
          </motion.li>
        ))}
      </ul>
    </motion.div>
  )
}

function QuickAddMenu({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const { role } = useApp()
  const actions = QUICK_ACTIONS.filter((a) => {
    const item = NAV_ITEMS.find((n) => n.to === a.to)
    return !item || item.roles.includes(role)
  })
  return (
    <motion.div
      initial={{ opacity: 0, y: -10, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      className="glass-card absolute right-0 top-[calc(100%+10px)] z-50 w-[290px] rounded-2xl p-2"
    >
      <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Quick actions</p>
      {actions.map((a, i) => (
        <motion.button
          key={a.to}
          type="button"
          initial={{ opacity: 0, x: -6 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.02 * i, duration: 0.2 }}
          onClick={() => {
            navigate(a.to)
            onClose()
          }}
          className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-ink-100"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-white">
            {a.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-bold text-ink-800">{a.label}</span>
            <span className="block truncate text-[10px] text-ink-400">{a.hint}</span>
          </span>
          <Plus size={14} className="ml-auto shrink-0 text-ink-300 transition-colors group-hover:text-ink-700" />
        </motion.button>
      ))}
    </motion.div>
  )
}

function NavPillButton({
  onClick,
  icon,
  children,
  active,
  className,
}: {
  onClick: () => void
  icon: ReactNode
  children: ReactNode
  active?: boolean
  className?: string
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-bold transition-colors',
        active ? 'bg-ink-900 text-white' : 'bg-ink-100 text-ink-600 hover:bg-ink-200/70 hover:text-ink-900',
        className,
      )}
    >
      {icon}
      {children}
    </motion.button>
  )
}

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export function AppLayout({ children }: { children: ReactNode }) {
  const { role, cases } = useApp()
  const { user: authUser, logout } = useAuth()
  const now = useClock()
  const [searchOpen, setSearchOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [bannerOpen, setBannerOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)
  const meta = USER_META[role]
  const user = {
    ...meta,
    name: authUser?.displayName ?? meta.name,
    initials: authUser ? initialsOf(authUser.displayName) : meta.initials,
  }

  const queueCount =
    role === 'doctor'
      ? cases.filter((c) => c.reviewStatus === 'awaiting-doctor').length
      : role === 'nurse'
        ? cases.filter((c) => c.reviewStatus === 'awaiting-nurse').length
        : cases.filter((c) => c.reviewStatus === 'awaiting-nurse' || c.reviewStatus === 'awaiting-doctor').length

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setSearchOpen((v) => !v)
        setQuickOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const vv = window.visualViewport
    const update = () => {
      const v = window.visualViewport
      if (!v) {
        setKbOpen(false)
        return
      }
      setKbOpen(window.innerHeight - v.height > 120)
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [])

  const time = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })
  const day = now.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
  const timeShort = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })

  return (
    <div className="min-h-screen bg-canvas">
      {/* ===== Thin fixed icon rail (md and up) ===== */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[78px] flex-col bg-ink-900 md:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60px_60px_at_50%_0%,rgba(163,230,53,0.16),transparent_70%)]" />
        <SidebarContent />
      </aside>

      {/* ===== Light content panel ===== */}
      <div className="min-w-0 md:pl-[78px]">
        <div className="px-2 py-2 sm:px-4 sm:py-4">
          <div className="glass-card overflow-hidden rounded-2xl">
            {/* -------- Top navbar -------- */}
            <header className="relative border-b border-ink-100/80 px-4 py-4 sm:px-6 sm:py-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                {/* Greeting */}
                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0">
                    <h1 className="truncate text-[20px] font-extrabold leading-none tracking-tight text-ink-900 sm:text-[26px]">
                      Hi {user.name.split(' ')[0]}
                    </h1>
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[12px] text-ink-500">
                      <span className="hidden items-center gap-1 font-semibold text-brand-700 sm:inline-flex">
                        <Stethoscope size={12} /> {ROLE_LABEL[role]}
                      </span>
                      <span className="hidden text-ink-300 sm:inline">·</span>
                      <span className="max-w-[170px] truncate sm:max-w-none">
                        {queueCount === 0
                          ? 'No cases waiting on your queue'
                          : `${queueCount} case${queueCount === 1 ? '' : 's'} need${queueCount === 1 ? 's' : ''} your review`}
                      </span>
                    </p>
                  </div>
                </div>

                {/* Right cluster */}
                <div className="flex flex-wrap items-center gap-2">
                  <FacilitySwitcher />
                  <div className="hidden items-center gap-1.5 rounded-2xl bg-ink-100/80 p-1 md:flex">
                    <div className="relative">
                      <NavPillButton
                        onClick={() => {
                          setQuickOpen((v) => !v)
                          setSearchOpen(false)
                        }}
                        active={quickOpen}
                        icon={<Plus size={14} strokeWidth={2.75} />}
                      >
                        Quick actions
                      </NavPillButton>
                      <AnimatePresence>
                        {quickOpen && <QuickAddMenu onClose={() => setQuickOpen(false)} />}
                      </AnimatePresence>
                    </div>

                    <div className="relative">
                      <NavPillButton
                        onClick={() => {
                          setSearchOpen((v) => !v)
                          setQuickOpen(false)
                        }}
                        active={searchOpen}
                        icon={<Search size={14} />}
                      >
                        Search
                      </NavPillButton>
                      <AnimatePresence>
                        {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
                      </AnimatePresence>
                    </div>
                  </div>

                  {/* Mobile helper icons (below md) */}
                  <div className="flex items-center gap-1 md:hidden">
                    <div className="relative">
                      <motion.button
                        type="button"
                        onClick={() => {
                          setQuickOpen((v) => !v)
                          setSearchOpen(false)
                        }}
                        whileTap={{ scale: 0.92 }}
                        aria-label="Quick actions"
                        aria-expanded={quickOpen}
                        className={cx(
                          'flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-100 text-ink-500',
                          quickOpen && 'bg-ink-900 text-white',
                        )}
                      >
                        <Plus size={17} />
                      </motion.button>
                      <AnimatePresence>
                        {quickOpen && <QuickAddMenu onClose={() => setQuickOpen(false)} />}
                      </AnimatePresence>
                    </div>

                    <motion.button
                      type="button"
                      onClick={() => {
                        setSearchOpen((v) => !v)
                        setQuickOpen(false)
                      }}
                      whileTap={{ scale: 0.92 }}
                      aria-label="Search sections"
                      className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"
                    >
                      <Search size={17} />
                    </motion.button>
                  </div>

                  {/* Clock (icon-only below sm, full chip from sm) */}
                  <div
                    className="flex items-center gap-2.5 rounded-2xl bg-ink-100/80 px-2.5 py-2 sm:px-3.5"
                    title={`${time} ${day}`}
                  >
                    <span className="text-[14px] font-extrabold tabular-nums leading-none tracking-tight text-ink-900 sm:text-[15px]">
                      {timeShort}
                    </span>
                    <span className="hidden text-[10px] font-semibold leading-tight text-ink-400 sm:block">{day}</span>
                  </div>

                  {/* Signed-in account */}
                  <div
                    className="hidden items-center gap-2 rounded-2xl bg-ink-100/80 px-3 py-2 md:flex"
                    title={authUser ? `${authUser.username} — ${ROLE_LABEL[role]}` : ROLE_LABEL[role]}
                  >
                    <span
                      className={cx(
                        'flex h-6 w-6 items-center justify-center rounded-lg text-[10px] font-extrabold text-ink-900',
                        meta.tile,
                      )}
                    >
                      {user.initials}
                    </span>
                    <span className="min-w-0">
                      <span className="block max-w-[140px] truncate text-[12px] font-bold leading-tight text-ink-900">
                        {user.name}
                      </span>
                      <span className="block max-w-[140px] truncate text-[10px] font-semibold leading-tight text-ink-400">
                        {ROLE_LABEL[role]}
                      </span>
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => void logout()}
                    className="flex h-10 w-10 items-center justify-center rounded-2xl bg-ink-100 text-ink-500 transition-colors hover:bg-ink-200/70 hover:text-ink-800"
                    title="Sign out"
                    aria-label="Sign out"
                  >
                    <LogOut size={16} />
                  </button>
                </div>
              </div>

              {/* Safety strip */}
              <div className="mt-4">
                {/* Desktop: full strip */}
                <div className="hidden flex-wrap items-center gap-x-5 gap-y-1 text-[11px] text-amber-900 md:flex">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <ShieldCheck size={13} className="text-amber-600" />
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                      AI assistance only
                    </span>
                    This prototype organizes patient information — it does not diagnose or replace clinicians.
                  </span>
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                    <Mic size={13} /> Capture → Verify → Prioritize → Refer → Follow Up
                  </span>
                </div>

                {/* Mobile: collapsible compact strip */}
                <button
                  type="button"
                  onClick={() => setBannerOpen((v) => !v)}
                  aria-expanded={bannerOpen}
                  className="flex w-full items-center gap-1.5 rounded-xl bg-amber-50/70 px-3 py-2 text-left text-[11px] text-amber-900 md:hidden"
                >
                  <ShieldCheck size={13} className="shrink-0 text-amber-600" />
                  <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wide">
                    AI assistance only
                  </span>
                  <span className={cx('min-w-0 leading-snug', bannerOpen ? 'line-clamp-none' : 'line-clamp-1')}>
                    This prototype organizes patient information — it does not diagnose or replace clinicians.
                  </span>
                  <ChevronDown
                    size={14}
                    className={cx('ml-auto shrink-0 text-amber-600 transition-transform duration-200', bannerOpen && 'rotate-180')}
                  />
                </button>
                {bannerOpen && (
                  <div className="mx-3 mt-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700 md:hidden">
                    <Mic size={12} /> Capture → Verify → Prioritize → Refer → Follow Up
                  </div>
                )}
              </div>
            </header>

            {/* -------- Page content -------- */}
            <main className="px-3 pb-28 pt-4 sm:px-5 sm:pt-5 md:pb-5">
              <DisclaimerBanner compact />
              {children}
            </main>

            <footer className="px-3 pb-4 sm:px-5 sm:pb-5">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-ink-50/70 px-4 py-3">
                <p className="flex items-center gap-2 text-[11px] font-medium text-ink-500">
                  <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-white text-brand-700 ring-1 ring-ink-200/70">
                    <Sparkles size={13} />
                  </span>
                  SwasthyaFlow AI · Human-in-the-loop — AI never replaces healthcare professionals.
                </p>
                <p className="text-[11px] font-semibold text-ink-400">Synthetic / public sample data only</p>
              </div>
            </footer>
          </div>
        </div>
      </div>

      {/* ===== Mobile bottom navigation + More sheet ===== */}
      <BottomNav
        keyboardOpen={kbOpen}
        moreOpen={moreOpen}
        onMore={() => setMoreOpen((v) => !v)}
      />
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} />
    </div>
  )
}
