import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { useRef, useState } from 'react'
import { useThemeContext, type ThemeMode } from '../../context/ThemeContext'
import { FloatingPanel } from '../FloatingPanel'
import { cx } from '../ui'

const OPTIONS: { mode: ThemeMode; label: string; hint: string; icon: typeof Sun }[] = [
  { mode: 'light', label: 'Light', hint: 'Always bright', icon: Sun },
  { mode: 'dark', label: 'Dark', hint: 'Always dark', icon: Moon },
  { mode: 'system', label: 'System', hint: 'Follow device', icon: Monitor },
]

export function ThemeToggle() {
  const { mode, setMode } = useThemeContext()
  const [open, setOpen] = useState(false)
  const anchorRef = useRef<HTMLButtonElement>(null)

  const ActiveIcon = OPTIONS.find((o) => o.mode === mode)?.icon ?? Monitor

  return (
    <>
      <button
        ref={anchorRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Appearance — light, dark or system"
        aria-haspopup="menu"
        aria-expanded={open}
        className={cx(
          'flex h-9 w-9 items-center justify-center rounded-lg text-ink-500 transition-colors sm:h-11 sm:w-11 sm:rounded-2xl',
          open ? 'bg-ink-900 text-white' : 'bg-ink-100 hover:text-ink-800',
        )}
      >
        <ActiveIcon size={17} />
      </button>
      <FloatingPanel open={open} anchorRef={anchorRef} onClose={() => setOpen(false)} placement="bottom-end" ariaLabel="Appearance" className="w-52">
        <p className="px-2.5 pb-1 pt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-ink-400">Appearance</p>
        {OPTIONS.map((o) => {
          const active = mode === o.mode
          return (
            <button
              key={o.mode}
              type="button"
              data-menu-item
              onClick={() => {
                setMode(o.mode)
                setOpen(false)
              }}
              className={cx(
                'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors hover:bg-ink-100 focus-visible:ring-2 focus-visible:ring-brand-500',
                active ? 'bg-brand-50 text-brand-800' : 'text-ink-600',
              )}
            >
              <span className={cx('shrink-0', active ? 'text-brand-600' : 'text-ink-400')}>
                <o.icon size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-bold leading-tight">{o.label}</span>
                <span className="block text-[10px] text-ink-400">{o.hint}</span>
              </span>
              {active && <Check size={14} className="shrink-0 text-brand-600" />}
            </button>
          )
        })}
      </FloatingPanel>
    </>
  )
}