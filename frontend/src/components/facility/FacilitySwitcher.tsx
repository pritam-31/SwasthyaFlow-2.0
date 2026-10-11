import { AnimatePresence, motion } from 'framer-motion'
import { Building2, Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { getFacility } from '../../services/facilityApi'
import type { Facility } from '../../types/facility.types'
import { cx } from '../ui'

/**
 * The facility currently in scope (P1-10). System-admins get a dropdown to
 * switch facility via X-Facility-Id; everyone else sees a static badge.
 */
export function FacilitySwitcher() {
  const { activeFacilityId, facilities, isSystemAdmin, switchFacility } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [resolved, setResolved] = useState<Facility | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const known = facilities.find((f) => f.id === activeFacilityId) ?? null

  // Non-admins receive an empty facility list — resolve their single facility.
  useEffect(() => {
    if (known || !activeFacilityId || isSystemAdmin) return
    let alive = true
    getFacility(activeFacilityId)
      .then((f) => {
        if (alive) setResolved(f)
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [known, activeFacilityId, isSystemAdmin])

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const active = known ?? resolved
  const label = active?.name ?? 'Facility'

  return (
    <div ref={dropdownRef} className="relative">
      <button
        type="button"
        onClick={() => isSystemAdmin && setOpen((v) => !v)}
        disabled={!isSystemAdmin}
        aria-label="Facility in scope"
        className={cx(
          'flex items-center gap-2 rounded-2xl border border-ink-100 bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-700',
          isSystemAdmin && 'hover:bg-ink-100/70',
        )}
        title={active?.name ?? 'Facility in scope'}
      >
        <Building2 size={14} className="text-brand-600" />
        <span className="max-w-[150px] truncate">{label}</span>
        {isSystemAdmin && <ChevronDown size={13} className="text-ink-400" />}
      </button>

      <AnimatePresence>
        {open && isSystemAdmin && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            className="glass-card absolute right-0 z-50 mt-1.5 w-72 rounded-2xl p-1.5"
          >
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-bold uppercase tracking-wider text-ink-400">
              Switch facility
            </p>
            <div className="max-h-72 overflow-y-auto">
              {facilities.length === 0 && (
                <p className="px-2.5 py-2 text-xs text-ink-500">No facilities available.</p>
              )}
              {facilities.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  disabled={busy || f.status === 'archived'}
                  onClick={async () => {
                    setBusy(true)
                    try {
                      await switchFacility(f.id)
                      setOpen(false)
                    } finally {
                      setBusy(false)
                    }
                  }}
                  className={cx(
                    'flex w-full items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs hover:bg-ink-100/70',
                    f.status === 'archived' && 'opacity-50',
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-ink-800">{f.name}</span>
                    <span className="block truncate text-[10px] capitalize text-ink-400">{f.status}</span>
                  </span>
                  {f.id === activeFacilityId && <Check size={14} className="shrink-0 text-brand-600" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
