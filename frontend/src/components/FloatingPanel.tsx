import { motion } from 'framer-motion'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { cx } from './ui'

type Placement = 'bottom-start' | 'bottom-end' | 'right-start'

interface FloatingPanelProps {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  onClose: () => void
  placement?: Placement
  className?: string
  children: ReactNode
  ariaLabel?: string
}

const PAD = 8

/**
 * Portal-based popover. Renders into document.body so it can never be clipped
 * by an ancestor `overflow-hidden`, flips when it would overflow the viewport,
 * clamps to the edges, grows an internal scroll when tall, and is keyboard
 * navigable (↑ ↓ Home End, Enter activates a focused button, Esc closes).
 */
export function FloatingPanel({
  open,
  anchorRef,
  onClose,
  placement = 'bottom-start',
  className,
  children,
  ariaLabel,
}: FloatingPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [style, setStyle] = useState<CSSProperties>({ position: 'fixed', top: 0, left: 0, visibility: 'hidden' })
  const location = useLocation()
  const pathRef = useRef(location.pathname)

  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const anchor = anchorRef.current
      const panel = panelRef.current
      if (!anchor) return
      const r = anchor.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      const pw = panel?.offsetWidth ?? 280
      const ph = panel?.offsetHeight ?? 320
      let top: number
      let left: number

      if (placement === 'right-start') {
        left = r.right + PAD
        if (left + pw > vw - PAD) left = Math.max(PAD, r.left - pw - PAD)
        top = Math.min(Math.max(PAD, r.top), Math.max(PAD, vh - ph - PAD))
      } else {
        let below = r.bottom + PAD
        if (below + ph > vh - PAD) {
          const above = r.top - ph - PAD
          below = above >= PAD ? above : Math.max(PAD, vh - ph - PAD)
        }
        top = Math.max(PAD, below)
        left = placement === 'bottom-end' ? r.right - pw : r.left
        left = Math.max(PAD, Math.min(left, vw - pw - PAD))
      }
      setStyle({
        position: 'fixed',
        top,
        left,
        visibility: 'visible',
        maxHeight: `calc(100dvh - ${top + PAD}px)`,
      })
    }
    place()
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, true)
    return () => {
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, true)
    }
  }, [open, placement, anchorRef])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (anchorRef.current?.contains(target)) return
      onClose()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose, anchorRef])

  // Close automatically when the route changes (e.g. back/forward navigation).
  useEffect(() => {
    if (pathRef.current !== location.pathname) {
      pathRef.current = location.pathname
      if (open) onClose()
    }
  }, [location.pathname, open, onClose])

  // Move focus to the first item when the panel opens.
  useEffect(() => {
    if (!open) return
    const id = window.setTimeout(() => {
      panelRef.current?.querySelector<HTMLElement>('[data-menu-item]')?.focus()
    }, 30)
    return () => window.clearTimeout(id)
  }, [open])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(
      panelRef.current?.querySelectorAll<HTMLElement>('[data-menu-item]') ?? [],
    )
    if (items.length === 0) return
    const index = items.indexOf(document.activeElement as HTMLElement)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      items[(index + 1 + items.length) % items.length].focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      items[(index - 1 + items.length) % items.length].focus()
    } else if (e.key === 'Home') {
      e.preventDefault()
      items[0].focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      items[items.length - 1].focus()
    }
  }

  if (!open) return null

  return createPortal(
    <motion.div
      ref={panelRef}
      role="menu"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      initial={{ opacity: 0, y: -6, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
      style={style}
      className={cx(
        'z-[70] overflow-y-auto overscroll-contain rounded-2xl border border-ink-100 bg-white p-2 shadow-[var(--shadow-lift)]',
        className,
      )}
    >
      {children}
    </motion.div>,
    document.body,
  )
}
