import { AnimatePresence, animate, motion, useInView } from 'framer-motion'
import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

export const EASE = [0.22, 1, 0.36, 1] as const

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(' ')
}

/* ---------- Motion primitives ---------- */

export function Stagger({
  children,
  className,
  gap = 0.06,
}: {
  children: ReactNode
  className?: string
  gap?: number
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } } }}
    >
      {children}
    </motion.div>
  )
}

export function CountUp({ value, duration = 1.1 }: { value: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, margin: '-30px' })
  useEffect(() => {
    if (!inView || !ref.current) return
    const node = ref.current
    const controls = animate(0, value, {
      duration,
      ease: 'easeOut',
      onUpdate: (v) => {
        node.textContent = Math.round(v).toString()
      },
    })
    return () => controls.stop()
  }, [inView, value, duration])
  return <span ref={ref}>{value}</span>
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('sf-skeleton', className)} />
}

/* ---------- Composite component ---------- */

export function Card({
  children,
  className,
  title,
  subtitle,
  action,
  pad = true,
  id,
  accent,
}: {
  children: ReactNode
  className?: string
  title?: ReactNode
  subtitle?: string
  action?: ReactNode
  pad?: boolean
  id?: string
  accent?: string
}) {
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.35, ease: EASE }}
      className={cx(
        'overflow-hidden rounded-2xl',
        accent ? accent : 'glass-card',
        className,
      )}
    >
      {(title || subtitle || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div>
            {title && (
              <h3 className="flex items-center gap-2 text-sm font-bold tracking-tight text-ink-800">{title}</h3>
            )}
            {subtitle && <p className="mt-0.5 text-xs text-ink-400">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={pad ? 'p-5' : ''}>{children}</div>
    </motion.section>
  )
}

export function PageHeader({
  title,
  subtitle,
  action,
  icon,
  eyebrow,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
  icon?: ReactNode
  eyebrow?: string
}) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="flex flex-wrap items-start justify-between gap-3"
    >
      <div className="flex items-start gap-3.5">
        {icon && (
          <motion.div
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 18, delay: 0.05 }}
            className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-800 text-white shadow-md shadow-brand-900/20 ring-1 ring-inset ring-white/40 sm:flex"
          >
            {icon}
          </motion.div>
        )}
        <div>
          {eyebrow && <span className="sf-eyebrow">{eyebrow}</span>}
          <h1 className="mt-0.5 text-[22px] font-extrabold leading-tight tracking-tight text-ink-900">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-2xl text-xs leading-relaxed text-ink-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </motion.header>
  )
}

export function InfoBanner({
  tone = 'brand',
  children,
}: {
  tone?: 'brand' | 'amber' | 'rose' | 'sky'
  children: ReactNode
}) {
  const tones = {
    brand: 'border-brand-200 bg-brand-50/70 text-brand-900',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-900',
    rose: 'border-rose-200 bg-rose-50/70 text-rose-800',
    sky: 'border-sky-200 bg-sky-50/70 text-sky-900',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.1, ease: EASE }}
      className={cx('flex items-start gap-2.5 rounded-2xl border px-4 py-3 text-xs leading-relaxed', tones[tone])}
    >
      <span className="mt-0.5 shrink-0 font-bold">i</span>
      <div className="flex-1">{children}</div>
    </motion.div>
  )
}

export function Badge({ children, className, icon }: { children: ReactNode; className?: string; icon?: ReactNode }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset',
        className,
      )}
    >
      {icon && <span className="flex items-center">{icon}</span>}
      {children}
    </span>
  )
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  disabled,
  className,
  title,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  className?: string
  title?: string
  type?: 'button' | 'submit'
}) {
  const variants = {
    primary:
      'bg-gradient-to-b from-brand-600 to-brand-700 text-white shadow-sm shadow-brand-900/20 ring-1 ring-inset ring-brand-700 hover:from-brand-700 hover:to-brand-800 disabled:from-ink-200 disabled:to-ink-200 disabled:text-ink-400 disabled:shadow-none disabled:ring-ink-200',
    secondary:
      'bg-white text-ink-700 ring-1 ring-inset ring-ink-200 hover:bg-ink-50 hover:text-ink-900 disabled:text-ink-300',
    ghost: 'text-ink-500 hover:bg-ink-100 hover:text-ink-800 disabled:text-ink-300',
    danger:
      'bg-gradient-to-b from-rose-600 to-rose-700 text-white shadow-sm shadow-rose-900/20 ring-1 ring-inset ring-rose-700 hover:from-rose-700 hover:to-rose-800 disabled:from-ink-200 disabled:to-ink-200 disabled:text-ink-400 disabled:ring-ink-200',
    success:
      'bg-gradient-to-b from-emerald-600 to-emerald-700 text-white shadow-sm shadow-emerald-900/20 ring-1 ring-inset ring-emerald-700 hover:from-emerald-700 hover:to-emerald-800 disabled:from-ink-200 disabled:to-ink-200 disabled:text-ink-400 disabled:ring-ink-200',
  }
  const sizes = {
    sm: 'px-2.5 py-1.5 text-xs rounded-lg',
    md: 'px-3.5 py-2 text-sm rounded-xl',
    lg: 'px-5 py-2.5 text-[15px] rounded-xl',
  }
  return (
    <motion.button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.025 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 420, damping: 22 }}
      className={cx(
        'inline-flex items-center justify-center gap-2 font-semibold transition-colors duration-150 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
    >
      {children}
    </motion.button>
  )
}

export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <motion.div
            onClick={onClose}
            className="absolute inset-0 bg-ink-900/40 backdrop-blur-[3px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            aria-hidden="true"
          />
          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 40, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 320, damping: 28 }}
            className={cx(
              'relative max-h-[92vh] w-full overflow-hidden rounded-t-3xl bg-white shadow-[var(--shadow-lift)] sm:rounded-2xl',
              wide ? 'sm:max-w-3xl' : 'sm:max-w-lg',
            )}
          >
            <header className="sticky top-0 z-10 flex items-center justify-between border-b border-ink-100 bg-white/95 px-5 py-4 backdrop-blur">
              <h3 className="text-sm font-bold text-ink-800">{title}</h3>
              <button
                onClick={onClose}
                className="rounded-lg p-1.5 text-ink-400 transition-colors hover:bg-ink-100 hover:text-ink-700"
                aria-label="Close"
              >
                <X size={17} />
              </button>
            </header>
            <div className="max-h-[80vh] overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ProgressBar({ value, tone = 'brand' }: { value: number; tone?: 'brand' | 'amber' | 'rose' | 'emerald' | 'sky' | 'violet' }) {
  const tones = {
    brand: 'from-brand-400 to-brand-600',
    emerald: 'from-emerald-400 to-emerald-600',
    sky: 'from-sky-400 to-sky-600',
    amber: 'from-amber-400 to-amber-500',
    rose: 'from-rose-400 to-rose-500',
    violet: 'from-violet-400 to-violet-600',
  }
  const clamped = Math.min(100, Math.max(0, value))
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
      <motion.div
        className={cx('h-full rounded-full bg-gradient-to-r', tones[tone])}
        initial={{ width: 0 }}
        whileInView={{ width: `${clamped}%` }}
        viewport={{ once: true, margin: '-30px' }}
        transition={{ duration: 0.8, ease: EASE }}
      />
    </div>
  )
}

export function KpiTile({
  label,
  value,
  tone,
  icon,
  hint,
}: {
  label: string
  value: number | string
  tone: 'brand' | 'amber' | 'rose' | 'sky' | 'emerald' | 'violet'
  icon: ReactNode
  hint?: string
}) {
  const tiles = {
    brand: 'from-brand-500 to-brand-700',
    emerald: 'from-emerald-500 to-emerald-700',
    amber: 'from-amber-400 to-amber-600',
    rose: 'from-rose-500 to-rose-700',
    sky: 'from-sky-500 to-sky-700',
    violet: 'from-violet-500 to-violet-700',
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      whileHover={{ y: -3 }}
      transition={{ duration: 0.4, ease: EASE }}
      className="sf-card-hover relative overflow-hidden rounded-2xl border border-ink-200/80 bg-white/85 p-5 backdrop-blur"
    >
      <div className="flex items-center gap-4">
        <motion.div
          initial={{ scale: 0.6, rotate: -6 }}
          whileInView={{ scale: 1, rotate: 0 }}
          viewport={{ once: true }}
          transition={{ type: 'spring', stiffness: 260, damping: 16, delay: 0.08 }}
          className={cx(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-md',
            tiles[tone],
          )}
        >
          {icon}
        </motion.div>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink-400">{label}</p>
          <p className="mt-0.5 text-[26px] font-extrabold leading-none tracking-tight text-ink-900">
            {typeof value === 'number' ? <CountUp value={value} /> : value}
          </p>
          {hint && <p className="mt-1 text-[10px] font-medium text-ink-400">{hint}</p>}
        </div>
      </div>
    </motion.div>
  )
}

export function EmptyState({ icon, title, hint }: { icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-ink-100 text-ink-400 ring-1 ring-inset ring-ink-200">
        {icon}
      </div>
      <p className="text-sm font-semibold text-ink-600">{title}</p>
      {hint && <p className="max-w-sm text-xs text-ink-400">{hint}</p>}
    </div>
  )
}

export function SourceRef({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium text-ink-500">
      {label}
    </span>
  )
}