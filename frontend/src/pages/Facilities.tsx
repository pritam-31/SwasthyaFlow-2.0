import { motion } from 'framer-motion'
import { Archive, Building2, Check, PauseCircle, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { PageHeader, Card, Button, Badge, Modal, EmptyState, KpiTile, cx } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useApp } from '../store/AppStore'
import * as facilityApi from '../services/facilityApi'
import {
  FACILITY_TYPES,
  FACILITY_TYPE_LABELS,
  type Facility,
  type FacilityCreateInput,
  type FacilityStats,
  type FacilityType,
} from '../types/facility.types'

const STATUS_TONE: Record<Facility['status'], string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  suspended: 'bg-amber-50 text-amber-700 ring-amber-200',
  archived: 'bg-ink-100 text-ink-500 ring-ink-200',
}

const EMPTY_FORM: FacilityCreateInput = { name: '', type: 'phc', region: '', district: '', state: '', contactRef: '' }

export default function FacilitiesPage() {
  const { isSystemAdmin, isFacilityAdmin, activeFacilityId, switchFacility, refreshFacilities } = useAuth()
  const { pushToast } = useApp()
  const [list, setList] = useState<Facility[]>([])
  const [loading, setLoading] = useState(true)
  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Facility | null>(null)
  const [form, setForm] = useState<FacilityCreateInput>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [statsFor, setStatsFor] = useState<string | null>(null)
  const [stats, setStats] = useState<FacilityStats | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setList(await facilityApi.listFacilities())
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not load facilities.')
    } finally {
      setLoading(false)
    }
  }, [pushToast])

  useEffect(() => {
    void load()
  }, [load])

  const totals = useMemo(
    () => ({ total: list.length, active: list.filter((f) => f.status === 'active').length }),
    [list],
  )

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormOpen(true)
  }

  function openEdit(f: Facility) {
    setEditing(f)
    setForm({ name: f.name, type: f.type, region: f.region ?? '', district: f.district ?? '', state: f.state ?? '', contactRef: f.contactRef ?? '' })
    setFormOpen(true)
  }

  async function submit() {
    if (!form.name.trim()) {
      pushToast('warning', 'Facility name is required.')
      return
    }
    setSaving(true)
    try {
      if (editing) {
        await facilityApi.updateFacility(editing.id, form)
        pushToast('success', `Updated ${form.name}.`)
      } else {
        await facilityApi.createFacility(form)
        pushToast('success', `Created ${form.name}.`)
      }
      setFormOpen(false)
      await load()
      await refreshFacilities()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not save facility.')
    } finally {
      setSaving(false)
    }
  }

  async function openStats(id: string) {
    setStatsFor(id)
    setStats(null)
    try {
      setStats(await facilityApi.facilityStats(id))
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Could not load stats.')
    }
  }

  async function act(kind: 'suspend' | 'archive' | 'delete', f: Facility) {
    if (kind === 'delete' && !window.confirm(`Delete ${f.name}? This cannot be undone.`)) return
    try {
      if (kind === 'suspend') await facilityApi.suspendFacility(f.id)
      if (kind === 'archive') await facilityApi.archiveFacility(f.id)
      if (kind === 'delete') await facilityApi.deleteFacility(f.id)
      pushToast('success', `${f.name} ${kind === 'suspend' ? 'suspended' : kind === 'archive' ? 'archived' : 'deleted'}.`)
      await load()
      await refreshFacilities()
    } catch (err) {
      pushToast('error', err instanceof Error ? err.message : 'Action failed.')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Multi-tenancy"
        title="Facilities"
        subtitle="Every case, report and audit entry is scoped to one facility. Switch scope to move between tenants."
        icon={<Building2 size={22} />}
        action={
          <>
            <Button variant="secondary" size="sm" onClick={() => void load()}>
              <RefreshCw size={14} /> Refresh
            </Button>
            {isSystemAdmin && (
              <Button size="sm" onClick={openCreate}>
                <Plus size={14} /> New facility
              </Button>
            )}
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiTile label="Facilities" value={totals.total} tone="brand" icon={<Building2 size={20} />} />
        <KpiTile label="Active" value={totals.active} tone="emerald" icon={<Check size={20} />} />
      </div>

      <Card pad={false}>
        {loading ? (
          <div className="p-10 text-center text-xs text-ink-400">Loading facilities…</div>
        ) : list.length === 0 ? (
          <EmptyState icon={<Building2 size={20} />} title="No facilities" hint="Create the first facility to get started." />
        ) : (
          <ul className="divide-y divide-ink-100">
            {list.map((f) => (
              <motion.li key={f.id} layout className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold text-ink-800">{f.name}</span>
                    <Badge className={STATUS_TONE[f.status]}>{f.status}</Badge>
                    {f.id === activeFacilityId && (
                      <Badge className="bg-brand-50 text-brand-700 ring-brand-200">in scope</Badge>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-ink-400">
                    {FACILITY_TYPE_LABELS[f.type]}
                    {[f.district, f.state].filter(Boolean).length > 0 && ` · ${[f.district, f.state].filter(Boolean).join(', ')}`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <Button variant="ghost" size="sm" onClick={() => void openStats(f.id)}>
                    Stats
                  </Button>
                  {isSystemAdmin && f.status !== 'archived' && (
                    <Button variant="secondary" size="sm" disabled={f.id === activeFacilityId} onClick={() => void switchFacility(f.id).then(load)}>
                      Switch
                    </Button>
                  )}
                  {(isSystemAdmin || isFacilityAdmin) && f.status !== 'archived' && (
                    <Button variant="secondary" size="sm" onClick={() => openEdit(f)}>
                      <Pencil size={13} />
                    </Button>
                  )}
                  {isSystemAdmin && f.status === 'active' && (
                    <Button variant="secondary" size="sm" title="Suspend" onClick={() => void act('suspend', f)}>
                      <PauseCircle size={13} />
                    </Button>
                  )}
                  {isSystemAdmin && f.status !== 'archived' && (
                    <Button variant="secondary" size="sm" title="Archive" onClick={() => void act('archive', f)}>
                      <Archive size={13} />
                    </Button>
                  )}
                  {isSystemAdmin && f.id !== 'facility-default' && (
                    <Button variant="danger" size="sm" title="Delete" onClick={() => void act('delete', f)}>
                      <Trash2 size={13} />
                    </Button>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
        )}
      </Card>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title={editing ? `Edit ${editing.name}` : 'New facility'}>
        <div className="space-y-3">
          <Field label="Name">
            <input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 outline-none focus:border-brand-500"
              placeholder="District Hospital — Triage Unit"
            />
          </Field>
          <Field label="Type">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value as FacilityType })}
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 outline-none focus:border-brand-500"
            >
              {FACILITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {FACILITY_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="District">
              <input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 outline-none focus:border-brand-500" />
            </Field>
            <Field label="State">
              <input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 outline-none focus:border-brand-500" />
            </Field>
          </div>
          <Field label="Region / block">
            <input value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 outline-none focus:border-brand-500" />
          </Field>
          <Field label="Contact reference (never PII)">
            <input value={form.contactRef} onChange={(e) => setForm({ ...form, contactRef: e.target.value })} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-700 outline-none focus:border-brand-500" placeholder="e.g. NODE-PHC-042" />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving}>
              {saving ? 'Saving…' : editing ? 'Save changes' : 'Create facility'}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={statsFor !== null} onClose={() => setStatsFor(null)} title="Facility statistics">
        {stats ? (
          <div className="grid grid-cols-2 gap-3">
            <KpiTile label="Users" value={stats.users} tone="sky" icon={<Building2 size={18} />} />
            <KpiTile label="Sessions" value={stats.sessions} tone="brand" icon={<Building2 size={18} />} />
            <KpiTile label="Reports" value={stats.reports} tone="violet" icon={<Building2 size={18} />} />
            <KpiTile label="Visuals" value={stats.visuals} tone="amber" icon={<Building2 size={18} />} />
            <KpiTile label="Audit entries" value={stats.auditEntries} tone="emerald" icon={<Building2 size={18} />} />
          </div>
        ) : (
          <p className="py-8 text-center text-xs text-ink-400">Loading…</p>
        )}
      </Modal>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className={cx('block')}>
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-ink-400">{label}</span>
      {children}
    </label>
  )
}
