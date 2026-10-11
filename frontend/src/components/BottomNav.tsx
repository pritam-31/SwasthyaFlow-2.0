import { Grid2X2, Plus } from 'lucide-react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
import { useApp } from '../store/AppStore'
import { NAV_ITEMS, type NavItem } from './navItems'
import { cx } from './ui'

const BOTTOM = NAV_ITEMS.filter((n) => n.bottom && !n.center)
const MORE_POOL = NAV_ITEMS.filter((n) => !n.bottom && !n.center)

/**
 * YouTube-style bottom navigation — mobile only (<768px). The desktop rail
 * (md+) and this bar are both built from the shared NAV_ITEMS config and are
 * filtered to the signed-in role.
 */
export function BottomNav({
  keyboardOpen,
  moreOpen,
  onMore,
}: {
  keyboardOpen: boolean
  moreOpen: boolean
  onMore: () => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { role } = useApp()
  const bottom = BOTTOM.filter((n) => n.roles.includes(role))
  const morePool = MORE_POOL.filter((n) => n.roles.includes(role))
  const moreActive = moreOpen || morePool.some((n) => n.to === location.pathname)

  return (
    <nav
      aria-label="Primary"
      className={cx(
        'fixed inset-x-0 bottom-0 z-40 flex justify-center md:hidden',
        'transition-transform duration-200 ease-out',
        keyboardOpen ? 'translate-y-full' : 'translate-y-0',
      )}
    >
      <div
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
        className="relative flex h-[68px] w-full max-w-[560px] items-stretch justify-between gap-1 border-t border-ink-100/80 bg-white/95 px-2 pt-1.5 shadow-[0_-12px_30px_-18px_rgba(16,24,40,0.28)] backdrop-blur-xl"
      >
        {bottom.map((n) =>
          n.center ? (
            <FabSlot key={n.id} item={n} navigate={navigate} />
          ) : (
            <BottomSlot key={n.id} item={n} />
          ),
        )}
        <MoreSlot active={moreActive} onClick={onMore} />
      </div>
    </nav>
  )
}

function BottomSlot({ item }: { item: NavItem }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      aria-label={item.label}
      title={item.label}
      className={({ isActive }) =>
        cx(
          'sf-nav-item relative flex min-w-[52px] flex-1 flex-col items-center justify-center gap-[3px] rounded-xl px-1 pt-2 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500',
          isActive ? 'text-brand-700' : 'text-ink-400 active:text-ink-600',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cx(
              'relative flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150',
              isActive && 'bg-brand-100',
            )}
          >
            <Icon size={21} strokeWidth={isActive ? 2.4 : 1.9} />
          </span>
          <span className={cx('whitespace-nowrap text-[11px] leading-none', isActive ? 'font-bold' : 'font-semibold')}>
            {item.label}
          </span>
        </>
      )}
    </NavLink>
  )
}

function FabSlot({ item, navigate }: { item: NavItem; navigate: NavigateFunction }) {
  return (
    <button
      type="button"
      onClick={() => navigate(item.to)}
      aria-label={`${item.label} — start a new patient intake`}
      title={item.label}
      className="sf-nav-item relative flex min-w-[52px] flex-1 flex-col items-center justify-center gap-[3px] rounded-xl px-1 pt-0.5 outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
    >
      <span className="flex h-12 w-12 -translate-y-2.5 items-center justify-center rounded-full bg-gradient-to-b from-brand-600 to-brand-900 text-white shadow-lg shadow-brand-900/40 ring-[5px] ring-white transition-transform duration-150 active:scale-90">
        <Plus size={26} strokeWidth={2.5} />
      </span>
      <span className="-mt-2 whitespace-nowrap text-[11px] leading-none font-semibold text-ink-400">{item.label}</span>
    </button>
  )
}

function MoreSlot({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={active ? 'Close more sections' : 'More sections'}
      aria-expanded={active}
      className={cx(
        'sf-nav-item relative flex min-w-[52px] flex-1 flex-col items-center justify-center gap-[3px] rounded-xl px-1 pt-2 outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-brand-500',
        active ? 'text-brand-700' : 'text-ink-400 active:text-ink-600',
      )}
    >
      <span
        className={cx(
          'relative flex h-6 w-6 items-center justify-center rounded-full transition-colors duration-150',
          active && 'bg-brand-100',
        )}
      >
        <Grid2X2 size={21} strokeWidth={active ? 2.4 : 1.9} />
      </span>
      <span className={cx('whitespace-nowrap text-[11px] leading-none', active ? 'font-bold' : 'font-semibold')}>More</span>
    </button>
  )
}