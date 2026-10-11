import { Box, Button, Typography } from '@mui/material'
import { motion } from 'framer-motion'
import { ChevronRight } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppDataGrid, CompletenessCell, StatusPill, UrgencyPill, type ToneKey } from '../components/AppDataGrid'
import { Card, cx, PageHeader } from '../components/ui'
import { reviewMeta, urgencyOf } from '../lib/format'
import { useApp } from '../store/AppStore'
import type { CaseRecord, ReviewStatus } from '../types'

type Tab = 'all' | 'awaiting-nurse' | 'awaiting-doctor' | 'reviewed' | 'urgent'

const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'all', label: 'All cases' },
  { key: 'awaiting-nurse', label: 'Awaiting health-worker' },
  { key: 'awaiting-doctor', label: 'Awaiting doctor' },
  { key: 'urgent', label: 'Urgency signals' },
  { key: 'reviewed', label: 'Reviewed / closed' },
]

const STATUS_TONE: Record<ReviewStatus, ToneKey> = {
  'awaiting-nurse': 'sky',
  'awaiting-doctor': 'violet',
  reviewed: 'emerald',
  closed: 'ink',
}

export default function TriageQueue() {
  const { cases, role } = useApp()
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('all')

  const counts = useMemo(() => {
    const base: Record<Tab, number> = { all: cases.length, urgent: 0, reviewed: 0, 'awaiting-nurse': 0, 'awaiting-doctor': 0 }
    for (const c of cases) {
      if (c.reviewStatus === 'awaiting-nurse') base['awaiting-nurse'] += 1
      if (c.reviewStatus === 'awaiting-doctor') base['awaiting-doctor'] += 1
      if (c.reviewStatus === 'reviewed' || c.reviewStatus === 'closed') base.reviewed += 1
      if (c.urgencySignals.length > 0) base.urgent += 1
    }
    return base
  }, [cases])

  const rows = useMemo(() => {
    const rank = { urgent: 0, prompt: 1, routine: 2 }
    return cases.filter((c) => (tab === 'all' ? true : tab === 'urgent' ? c.urgencySignals.length > 0 : tab === 'reviewed' ? c.reviewStatus === 'reviewed' || c.reviewStatus === 'closed' : c.reviewStatus === tab)).sort((a, b) => rank[urgencyOf(a)] - rank[urgencyOf(b)])
  }, [cases, tab])

  const columns = useMemo<import('@mui/x-data-grid-pro').GridColDef<CaseRecord>[]>(
    () => [
      {
        field: 'patientId',
        headerName: 'Case',
        width: 190,
        renderCell: (p) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, height: '100%' }}>
            <Box
              sx={{
                width: 32,
                height: 32,
                borderRadius: '10px',
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                fontWeight: 800,
                flexShrink: 0,
                bgcolor: 'brand.50',
                color: 'brand.700',
              }}
            >
              {p.row.patientId.slice(-3)}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 13, lineHeight: 1.2 }}>{p.row.patientId}</Typography>
            </Box>
          </Box>
        ),
      },
      {
        field: 'chiefConcern',
        headerName: 'Concern',
        flex: 1,
        minWidth: 220,
        renderCell: (p) => (
          <Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {p.row.chiefConcern}
          </Typography>
        ),
      },
      {
        field: 'urgency',
        headerName: 'Urgency',
        width: 190,
        valueGetter: (_value, row) => urgencyOf(row),
        renderCell: (p) => <UrgencyPill level={urgencyOf(p.row)} />,
      },
      {
        field: 'completeness',
        headerName: 'Completeness',
        width: 170,
        type: 'number',
        renderCell: (p) => <CompletenessCell value={p.row.completeness} />,
      },
      {
        field: 'language',
        headerName: 'Language',
        width: 120,
        renderCell: (p) => <StatusPill tone="ink">{p.row.language}</StatusPill>,
      },
      {
        field: 'reportCount',
        headerName: 'Reports',
        width: 100,
        type: 'number',
        valueGetter: (_value, row) => row.reportIds.length,
        renderCell: (p) => <Typography variant="body2">{p.row.reportIds.length}</Typography>,
      },
      {
        field: 'reviewStatus',
        headerName: 'Status',
        width: 240,
        valueGetter: (_value, row) => reviewMeta[row.reviewStatus].label,
        renderCell: (p) => <StatusPill tone={STATUS_TONE[p.row.reviewStatus]}>{reviewMeta[p.row.reviewStatus].label}</StatusPill>,
      },
      {
        field: 'actions',
        headerName: '',
        width: 56,
        sortable: false,
        filterable: false,
        disableColumnMenu: true,
        renderCell: () => (
          <Box sx={{ display: 'flex', alignItems: 'center', height: '100%', color: 'text.disabled' }}>
            <ChevronRight size={16} />
          </Box>
        ),
      },
    ],
    [],
  )

  const openCase = (row: CaseRecord) => navigate(`/app/cases/${row.id}`)

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Workflow queue"
        title="Patient Triage Queue"
        subtitle="AI-prepares each case; a qualified healthcare worker keeps control. Urgency labels are workflow signals, not diagnoses."
      />
      <Card pad={false}>
        <div className="flex flex-wrap gap-1.5 border-b border-ink-100 px-5 py-3">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cx(
                'relative rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                tab === t.key ? 'text-white' : 'text-ink-600 hover:bg-ink-100',
              )}
            >
              {tab === t.key && (
                <motion.span
                  layoutId="triage-tab"
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  className="absolute inset-0 rounded-lg bg-brand-700"
                />
              )}
              <span className="relative z-10">
                {t.label} <span className="opacity-70">({counts[t.key]})</span>
              </span>
            </button>
          ))}
        </div>

        <AppDataGrid<CaseRecord>
          rows={rows}
          columns={columns}
          ariaLabel="Patient triage queue"
          storageKey="triage-queue"
          defaultDensity="compact"
          rowHeight={60}
          getRowId={(row) => row.id}
          onRowClick={openCase}
          checkboxSelection={role !== 'admin'}
          quickFilterPlaceholder="Search case / language…"
          bulkActions={(_ids, selected) => (
            <Button size="small" variant="contained" disableElevation onClick={() => selected[0] && openCase(selected[0])}>
              Open
            </Button>
          )}
          columnVisibilityModel={{ reportCount: role !== 'admin' }}
          mobileCardRenderer={(c) => (
            <button onClick={() => openCase(c)} className="w-full text-left">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-ink-900">{c.patientId}</span>
                <UrgencyPill level={urgencyOf(c)} />
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-ink-600">{c.chiefConcern}</p>
              <div className="mt-2 flex items-center gap-2">
                <StatusPill tone={STATUS_TONE[c.reviewStatus]}>{reviewMeta[c.reviewStatus].label}</StatusPill>
                <span className="text-xs text-ink-500">{c.completeness}% complete</span>
              </div>
            </button>
          )}
          emptyTitle="No cases in this view"
          emptyBody="Try a different filter or create a new intake case."
        />

        <div className="border-t border-ink-100 px-5 py-2.5 text-[11px] text-ink-500">
          {role === 'nurse'
            ? 'You can open a case, verify AI-extracted fields and escalate to the doctor.'
            : role === 'doctor'
              ? 'You can review source material, approve information and decide on referral. Referrals are only sent after your approval.'
              : 'Administrator view - read-only queue overview.'}
        </div>
      </Card>
    </div>
  )
}
