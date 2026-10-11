import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FolderOpen,
  Grid2X2,
  HeartPulse,
  Info,
  ListTodo,
  LogOut,
  Plus,
  Search,
  ShieldCheck,
  Stethoscope,
  User as UserIcon,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import type { ReactNode, RefObject } from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate, useOutlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useOffline } from '../context/OfflineContext'
import { useApp } from '../store/AppStore'
import { RouteMeta } from '../app/routes'
import { getDisplayName } from '../lib/displayName'
import { queueSummaryText, roleCounts, visibleCasesForRole, type RoleCounts } from '../lib/roleData'
import type { Role } from '../types'
import { BottomNav } from './BottomNav'
import { FloatingPanel } from './FloatingPanel'
import { MoreSheet } from './MoreSheet'
import { NAV_ITEMS, ROLE_LABEL } from './navItems'
import { cx, EASE } from './ui'
import { FacilitySwitcher } from './facility/FacilitySwitcher'
import { SyncStatusIndicator } from './offline/SyncStatusIndicator'
import { SyncQueuePanel } from './offline/SyncQueuePanel'

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
  { label: 'New patient intake', hint: 'Voice, text or report', to: '/app/new-intake', icon: <Users size={16} /> },
  { label: 'Open triage queue', hint: 'Cases waiting on review', to: '/app/triage', icon: <ListTodo size={16} /> },
  { label: 'Start a health camp', hint: 'Rapid screening mode', to: '/app/camps', icon: <HeartPulse size={16} /> },
  { label: 'Approval queue', hint: 'Referral drafts waiting', to: '/app/referrals', icon: <FileText size={16} /> },
]

/* ------------------------------------------------------------------ */
/*  Toasts                                                             */
/* ------------------------------------------------------------------ */

export function ToastStack() {
  const { toasts, dismissToast } = useApp()
  const [paused, setPaused] = useState(false)
  const icons = {
    success: <CheckCircle2 size={16} className="text-emerald-500" />,
    info: <Info size={16} className="text-sky-500" />,
    warning: <AlertCircle size={16} className="text-amber-500" />,
    error: <AlertCircle size={16} className="text-rose-500" />,
  }

  useEffect(() => {
    if (paused) return
    const timers = toasts.map((t) => window.setTimeout(() => dismissToast(t.id), 4000))
    return () => timers.forEach((id) => window.clearTimeout(id))
  }, [toasts, paused, dismissToast])

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="pointer-events-none fixed bottom-24 right-4 z-[80] flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2 md:bottom-4"
    >
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
            <X size={13} className="mt-0.5 shrink-0 text-ink-300" />
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

/** True at the md breakpoint and above (desktop rail visible, bottom bar hidden). */
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => (typeof window === 'undefined' ? false : window.matchMedia('(min-width: 768px)').matches))
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)')
    const onChange = () => setIsDesktop(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return isDesktop
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
          isActive ? 'text-white' : 'text-ink-400 hover:bg-white/5 hover:text-white',
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
          <span
            aria-current={isActive ? 'page' : undefined}
            className="relative z-10 transition-transform duration-200 group-active:scale-90"
          >
            {children}
          </span>
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

function ProfileMenu({ anchorRef, open, onClose }: { anchorRef: RefObject<HTMLElement | null>; open: boolean; onClose: () => void }) {
  const { role } = useApp()
  const { user, logout, facilities, activeFacilityId } = useAuth()
  const { pendingCount, failedCount } = useOffline()
  const [confirming, setConfirming] = useState(false)
  const facility = facilities.find((f) => f.id === activeFacilityId)?.name ?? 'Facility in scope'
  const unsynced = pendingCount + failedCount
  const name = getDisplayName(user?.displayName, (user as { firstName?: string } | null)?.firstName)

  return (
    <FloatingPanel open={open} anchorRef={anchorRef} onClose={onClose} placement="right-start" ariaLabel="Account menu" className="w-64">
      <div className="flex items-center gap-2.5 rounded-xl bg-ink-50 px-2.5 py-2">
        <span className={cx('flex h-9 w-9 items-center justify-center rounded-xl text-[12px] font-extrabold text-ink-900', USER_META[role].tile)}>
          {user ? initialsOf(user.displayName) : USER_META[role].initials}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-bold text-ink-900">{user?.displayName ?? name}</span>
          <span className="block truncate text-[11px] font-semibold text-ink-500">{ROLE_LABEL[role]}</span>
        </span>
      </div>
      <p className="mt-1 flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-ink-500">
        <ShieldCheck size={12} className="shrink-0 text-lime-600" />
        <span className="truncate">{facility}</span>
      </p>
      {unsynced > 0 && (
        <p className="mx-1 mb-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-800">
          {unsynced} item{unsynced === 1 ? '' : 's'} not yet synced.
        </p>
      )}
      {confirming ? (
        <div className="space-y-1.5 p-1">
          <p className="px-1.5 text-[11px] text-ink-600">
            Sign out with {unsynced} unsynced item{unsynced === 1 ? '' : 's'}? They stay queued for your next
            session on this device.
          </p>
          <button
            type="button"
            data-menu-item
            onClick={() => void logout()}
            className="flex w-full items-center gap-2 rounded-xl bg-rose-600 px-2.5 py-2 text-[12px] font-bold text-white hover:bg-rose-700"
          >
            <LogOut size={14} /> Sign out anyway
          </button>
          <button
            type="button"
            data-menu-item
            onClick={() => setConfirming(false)}
            className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] font-semibold text-ink-600 hover:bg-ink-100"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-menu-item
          onClick={() => (unsynced > 0 ? setConfirming(true) : void logout())}
          className="flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-[12px] font-bold text-rose-600 hover:bg-rose-50"
        >
          <LogOut size={14} /> Sign out
        </button>
      )}
    </FloatingPanel>
  )
}

function SidebarContent() {
  const { role, offlineMode, setOfflineMode } = useApp()
  const { user: authUser } = useAuth()
  const [moreOpen, setMoreOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const profileRef = useRef<HTMLButtonElement>(null)

  const primary = NAV_ITEMS.filter((n) => n.sidebar === 'primary' && n.roles.includes(role)).sort((a, b) => a.order - b.order)
  const overflow = NAV_ITEMS.filter((n) => n.sidebar === 'overflow' && n.roles.includes(role)).sort((a, b) => a.order - b.order)

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

        <nav aria-label="Primary" className="flex flex-col items-center gap-1.5">
          {primary.map((n, i) => (
            <motion.div
              key={n.to}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.03 * i, duration: 0.3, ease: EASE }}
            >
              <RailButton to={n.to} label={n.label}>
                <n.icon size={19} />
              </RailButton>
            </motion.div>
          ))}

          {overflow.length > 0 && (
            <div className="relative">
              <button
                ref={moreRef}
                type="button"
                onClick={() => setMoreOpen((v) => !v)}
                aria-label="More sections"
                aria-expanded={moreOpen}
                aria-haspopup="menu"
                title="More sections"
                className={cx(
                  'group flex h-11 w-11 items-center justify-center rounded-2xl transition-colors',
                  moreOpen ? 'bg-white/12 text-white ring-1 ring-inset ring-white/15' : 'text-ink-400 hover:bg-white/5 hover:text-white',
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

              <FloatingPanel
                open={moreOpen}
                anchorRef={moreRef}
                onClose={() => setMoreOpen(false)}
                placement="right-start"
                ariaLabel="More sections"
                className="w-56"
              >
                <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">
                  All sections
                </p>
                {overflow.map((n) => (
                  <NavLink
                    key={n.to}
                    to={n.to}
                    data-menu-item
                    onClick={() => setMoreOpen(false)}
                    aria-current={undefined}
                    className={({ isActive }) =>
                      cx(
                        'flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand-500',
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
              </FloatingPanel>
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
          className="group relative flex h-10 w-10 items-center justify-center rounded-2xl text-ink-400 transition-colors hover:bg-white/5 hover:text-white"
        >
          {offlineMode ? (
            <WifiOff size={18} className="text-amber-400" />
          ) : (
            <Wifi size={18} className="text-emerald-400" />
          )}
        </button>

        <div className="h-px w-7 bg-white/10" />

        <button
          ref={profileRef}
          type="button"
          onClick={() => setProfileOpen((v) => !v)}
          title={`${authUser?.displayName ?? USER_META[role].name} — account`}
          aria-label="Account and sign out"
          aria-haspopup="menu"
          aria-expanded={profileOpen}
          className={cx(
            'flex h-10 w-10 items-center justify-center rounded-2xl text-[12px] font-extrabold text-ink-900 ring-2 ring-white/15 transition-transform hover:scale-105',
            USER_META[role].tile,
          )}
        >
          {authUser ? initialsOf(authUser.displayName) : USER_META[role].initials}
        </button>
        <ProfileMenu anchorRef={profileRef} open={profileOpen} onClose={() => setProfileOpen(false)} />
      </div>
    </>
  )
}

/* ------------------------------------------------------------------ */
/*  Top navbar — quick actions + search + clock + facility              */
/* ------------------------------------------------------------------ */

interface PaletteItem {
  key: string
  label: string
  hint?: string
  to: string
  icon: ReactNode
}

function buildPalette(role: Role, cases: { id: string; patientId: string; chiefConcern: string }[]): PaletteItem[] {
  const pages: PaletteItem[] = NAV_ITEMS.filter((n) => n.roles.includes(role)).map((n) => ({
    key: `page:${n.to}`,
    label: n.label,
    hint: 'Section',
    to: n.to,
    icon: <n.icon size={15} />,
  }))
  const caseItems: PaletteItem[] = cases.slice(0, 40).map((c) => ({
    key: `case:${c.id}`,
    label: c.patientId,
    hint: c.chiefConcern,
    to: `/app/cases/${c.id}`,
    icon: <FolderOpen size={15} />,
  }))
  return [...pages, ...caseItems]
}

function SearchPalette({ anchorRef, open, onClose }: { anchorRef: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void }) {
  const { role, cases } = useApp()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const visible = useMemo(() => visibleCasesForRole(role, cases), [role, cases])
  const pool = useMemo(() => buildPalette(role, visible), [role, visible])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pool.filter((p) => p.hint === 'Section')
    return pool
      .filter((p) => p.label.toLowerCase().includes(q) || (p.hint ?? '').toLowerCase().includes(q) || p.to.includes(q))
      .slice(0, 20)
  }, [query, pool])

  const go = (to: string) => {
    navigate(to)
    onClose()
    setQuery('')
  }

  return (
    <FloatingPanel open={open} anchorRef={anchorRef} onClose={onClose} placement="bottom-end" ariaLabel="Search" className="w-[min(92vw,380px)]">
      <div className="flex items-center gap-2 rounded-xl bg-ink-100/80 px-3 py-2">
        <Search size={15} className="text-ink-400" />
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) go(results[0].to)
          }}
          placeholder="Search patients, cases, sections…"
          aria-label="Search patients, cases and sections"
          className="w-full bg-transparent text-[13px] font-medium text-ink-800 outline-none placeholder:text-ink-400"
        />
        <button type="button" onClick={onClose} aria-label="Close search" className="text-ink-400 hover:text-ink-700">
          <X size={15} />
        </button>
      </div>
      <ul className="mt-1.5 max-h-72 space-y-0.5 overflow-y-auto">
        {results.length === 0 && (
          <li className="px-2 py-6 text-center text-[12px] text-ink-400">No matches for “{query}”.</li>
        )}
        {results.map((r) => (
          <li key={r.key}>
            <button
              type="button"
              data-menu-item
              onClick={() => go(r.to)}
              className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[12px] font-semibold text-ink-700 outline-none transition-colors hover:bg-ink-100 hover:text-ink-900 focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              <span className="text-ink-400">{r.icon}</span>
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              {r.hint && <span className="max-w-[45%] shrink-0 truncate text-[10px] font-medium text-ink-400">{r.hint}</span>}
            </button>
          </li>
        ))}
      </ul>
    </FloatingPanel>
  )
}

function QuickAddMenu({ anchorRef, open, onClose }: { anchorRef: React.RefObject<HTMLElement | null>; open: boolean; onClose: () => void }) {
  const navigate = useNavigate()
  const { role } = useApp()
  const actions = QUICK_ACTIONS.filter((a) => {
    const item = NAV_ITEMS.find((n) => n.to === a.to)
    return !item || item.roles.includes(role)
  })
  return (
    <FloatingPanel open={open} anchorRef={anchorRef} onClose={onClose} placement="bottom-end" ariaLabel="Quick actions" className="w-[min(92vw,300px)]">
      <p className="px-2 pb-1.5 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Quick actions</p>
      {actions.map((a) => (
        <button
          key={a.to}
          type="button"
          data-menu-item
          onClick={() => {
            navigate(a.to)
            onClose()
          }}
          className="group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-brand-500"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-ink-900 text-white">
            {a.icon}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[12px] font-bold text-ink-800">{a.label}</span>
            <span className="block truncate text-[10px] text-ink-400">{a.hint}</span>
          </span>
          <Plus size={14} className="ml-auto shrink-0 text-ink-300 transition-colors group-hover:text-ink-700" />
        </button>
      ))}
      {actions.length === 0 && <p className="px-2.5 py-3 text-[11px] text-ink-400">No quick actions for your role.</p>}
    </FloatingPanel>
  )
}

function NavPillButton({
  onClick,
  icon,
  children,
  active,
  ariaExpanded,
  ariaLabel,
  innerRef,
  className,
}: {
  onClick: () => void
  icon: ReactNode
  children: ReactNode
  active?: boolean
  ariaExpanded?: boolean
  ariaLabel?: string
  innerRef?: RefObject<HTMLButtonElement | null>
  className?: string
}) {
  return (
    <motion.button
      ref={innerRef}
      type="button"
      onClick={onClick}
      aria-expanded={ariaExpanded}
      aria-haspopup="menu"
      aria-label={ariaLabel}
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
/*  Animated outlet                                                    */
/* ------------------------------------------------------------------ */

function AnimatedOutlet() {
  const location = useLocation()
  const element = useOutlet()
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={location.pathname}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.22, ease: EASE }}
      >
        {element}
      </motion.div>
    </AnimatePresence>
  )
}

/* ------------------------------------------------------------------ */
/*  Layout                                                             */
/* ------------------------------------------------------------------ */

export function AppLayout() {
  const { role, cases } = useApp()
  const { user: authUser } = useAuth()
  const now = useClock()
  const [queueOpen, setQueueOpen] = useState(false)
  const [quickOpen, setQuickOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [kbOpen, setKbOpen] = useState(false)

  const quickRef = useRef<HTMLButtonElement>(null)
  const searchRef = useRef<HTMLButtonElement>(null)
  const quickMobileRef = useRef<HTMLButtonElement>(null)
  const searchMobileRef = useRef<HTMLButtonElement>(null)
  const isDesktop = useIsDesktop()

  // Anchor the quick/search popovers to whichever trigger is actually visible:
  // the desktop pill (md+) or the icon button (below md). The anchors share one
  // open state so exactly one panel exists.
  const quickAnchor = isDesktop ? quickRef : quickMobileRef
  const searchAnchor = isDesktop ? searchRef : searchMobileRef

  const meta = USER_META[role]
  const greetingName = getDisplayName(authUser?.displayName, (authUser as { firstName?: string } | null)?.firstName)
  const tile = meta.tile

  const counts: RoleCounts = useMemo(() => roleCounts(visibleCasesForRole(role, cases)), [role, cases])
  const summary = queueSummaryText(role, counts)

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
    <div className="min-h-[100dvh] bg-canvas">
      <RouteMeta />
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
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Greeting */}
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cx(
                      'flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-[13px] font-extrabold text-ink-900 ring-1 ring-inset ring-black/5',
                      tile,
                    )}
                    aria-hidden="true"
                  >
                    {authUser ? initialsOf(authUser.displayName) : meta.initials}
                  </span>
                  <div className="min-w-0">
                    <h1 className="truncate text-[20px] font-extrabold leading-tight tracking-tight text-ink-900 sm:text-[24px]">
                      Hi {greetingName}
                    </h1>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[13px] text-ink-600">
                      <span className="inline-flex items-center gap-1 font-semibold text-brand-700">
                        <Stethoscope size={13} /> {ROLE_LABEL[role]}
                      </span>
                      <span className="text-ink-300" aria-hidden="true">·</span>
                      <span className="truncate">{summary}</span>
                    </p>
                  </div>
                </div>

                {/* Right cluster */}
                <div className="flex flex-wrap items-center gap-2">
                  <div className="hidden md:block">
                    <SyncStatusIndicator onOpen={() => setQueueOpen(true)} />
                  </div>
                  <FacilitySwitcher />

                  <div className="hidden items-center gap-1.5 rounded-2xl bg-ink-100/80 p-1 md:flex">
                    <div className="relative">
                      <NavPillButton
                        innerRef={quickRef}
                        onClick={() => {
                          setQuickOpen((v) => !v)
                          setSearchOpen(false)
                        }}
                        active={quickOpen}
                        ariaExpanded={quickOpen}
                        ariaLabel="Quick actions"
                        icon={<Plus size={14} strokeWidth={2.75} />}
                      >
                        Quick actions
                      </NavPillButton>
                    </div>

                    <div className="relative">
                      <NavPillButton
                        innerRef={searchRef}
                        onClick={() => {
                          setSearchOpen((v) => !v)
                          setQuickOpen(false)
                        }}
                        active={searchOpen}
                        ariaExpanded={searchOpen}
                        ariaLabel="Search"
                        icon={<Search size={14} />}
                      >
                        Search
                      </NavPillButton>
                    </div>
                  </div>

                  {/* Mobile helper icons (below md) */}
                  <div className="flex items-center gap-1 md:hidden">
                    <div className="relative">
                      <button
                        ref={quickMobileRef}
                        type="button"
                        onClick={() => {
                          setQuickOpen((v) => !v)
                          setSearchOpen(false)
                        }}
                        aria-label="Quick actions"
                        aria-haspopup="menu"
                        aria-expanded={quickOpen}
                        className={cx(
                          'flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-100 text-ink-500',
                          quickOpen && 'bg-ink-900 text-white',
                        )}
                      >
                        <Plus size={18} />
                      </button>
                    </div>

                    <button
                      ref={searchMobileRef}
                      type="button"
                      onClick={() => {
                        setSearchOpen((v) => !v)
                        setQuickOpen(false)
                      }}
                      aria-label="Search"
                      aria-haspopup="menu"
                      aria-expanded={searchOpen}
                      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"
                    >
                      <Search size={18} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setQueueOpen(true)}
                      aria-label="Offline queue"
                      className="flex h-11 w-11 items-center justify-center rounded-2xl bg-ink-100 text-ink-500"
                    >
                      <Wifi size={18} />
                    </button>
                  </div>

                  {/* Shared popovers — anchored to whichever trigger is visible */}
                  <QuickAddMenu anchorRef={quickAnchor} open={quickOpen} onClose={() => setQuickOpen(false)} />
                  <SearchPalette anchorRef={searchAnchor} open={searchOpen} onClose={() => setSearchOpen(false)} />

                  {/* Clock (icon-only below sm, full chip from sm) */}
                  <div
                    className="flex items-center gap-2.5 rounded-2xl bg-ink-100/80 px-2.5 py-2.5 sm:px-3.5"
                    title={`${time} ${day}`}
                  >
                    <span className="text-[14px] font-extrabold tabular-nums leading-none tracking-tight text-ink-900 sm:text-[15px]">
                      {timeShort}
                    </span>
                    <span className="hidden text-[10px] font-semibold leading-tight text-ink-500 sm:block">{day}</span>
                  </div>

                  {/* Signed-in account (info only — sign-out lives in the rail profile menu) */}
                  <div
                    className="hidden items-center gap-2 rounded-2xl bg-ink-100/80 px-3 py-2 md:flex"
                    title={authUser ? `${authUser.username} — ${ROLE_LABEL[role]}` : ROLE_LABEL[role]}
                  >
                    <UserIcon size={14} className="text-ink-400" />
                    <span className="min-w-0">
                      <span className="block max-w-[140px] truncate text-[12px] font-bold leading-tight text-ink-900">
                        {authUser?.displayName ?? greetingName}
                      </span>
                      <span className="block max-w-[140px] truncate text-[10px] font-semibold leading-tight text-ink-500">
                        {ROLE_LABEL[role]}
                      </span>
                    </span>
                  </div>
                </div>
              </div>
            </header>

            {/* -------- Page content -------- */}
            <main id="app-main" tabIndex={-1} className="px-3 pb-28 pt-4 outline-none sm:px-5 sm:pt-5 md:pb-6">
              <AnimatedOutlet />
            </main>
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
      <SyncQueuePanel open={queueOpen} onClose={() => setQueueOpen(false)} />
    </div>
  )
}
