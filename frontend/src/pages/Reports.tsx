import { Box, LinearProgress, Typography } from '@mui/material'
import type { GridColDef } from '@mui/x-data-grid-pro'
import { ArrowRight, FileText, Image as ImageIcon, ScanSearch, ShieldCheck, Upload } from 'lucide-react'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppDataGrid, StatusPill, type ToneKey } from '../components/AppDataGrid'
import { Card, InfoBanner, KpiTile, PageHeader } from '../components/ui'
import { useApp } from '../store/AppStore'
import type { Report } from '../types'

const OCR_TONE: Record<Report['ocrStatus'], ToneKey> = {
  done: 'emerald',
  'low-quality': 'amber',
  failed: 'rose',
}

const OCR_LABEL: Record<Report['ocrStatus'], string> = {
  done: 'Completed',
  'low-quality': 'Low quality',
  failed: 'Failed',
}

export default function Reports() {
  const { cases, reports } = useApp()
  const navigate = useNavigate()

  const ocrDone = reports.filter((r) => r.ocrStatus === 'done').length
  const ocrFailed = reports.filter((r) => r.ocrStatus !== 'done').length
  const verified = reports.reduce((sum, r) => sum + r.fields.filter((f) => f.status === 'verified').length, 0)

  const columns = useMemo<GridColDef<Report>[]>(
    () => [
      {
        field: 'name',
        headerName: 'Report',
        width: 280,
        renderCell: (p: { row: Report }) => (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, height: '100%' }}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 32,
                height: 32,
                borderRadius: 2,
                bgcolor: p.row.type === 'pdf' ? '#fff1f2' : '#f5f3ff',
                color: p.row.type === 'pdf' ? '#f43f5e' : '#8b5cf6',
              }}
            >
              {p.row.type === 'pdf' ? <FileText size={15} /> : <ImageIcon size={15} />}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" sx={{ fontWeight: 700 }} noWrap>
                {p.row.name}
              </Typography>
              {p.row.date && (
                <Typography variant="caption" color="text.secondary">
                  {p.row.date}
                </Typography>
              )}
            </Box>
          </Box>
        ),
      },
      {
        field: 'caseId',
        headerName: 'Case',
        width: 170,
        valueGetter: (_value, row: Report) => cases.find((c) => c.id === row.caseId)?.patientId ?? row.caseId,
        renderCell: (p: { row: Report }) => (
          <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.main' }}>
            {cases.find((c) => c.id === p.row.caseId)?.patientId ?? p.row.caseId}
          </Typography>
        ),
      },
      {
        field: 'kind',
        headerName: 'Kind',
        width: 140,
        renderCell: (p: { row: Report }) => <StatusPill tone="ink">{p.row.kind}</StatusPill>,
      },
      {
        field: 'ocrStatus',
        headerName: 'OCR status',
        width: 170,
        renderCell: (p: { row: Report }) => <StatusPill tone={OCR_TONE[p.row.ocrStatus]}>{OCR_LABEL[p.row.ocrStatus]}</StatusPill>,
      },
      {
        field: 'fields',
        headerName: 'Fields',
        width: 100,
        type: 'number' as const,
        valueGetter: (_value, row: Report) => row.fields.length,
        renderCell: (p: { row: Report }) => <Typography variant="body2">{p.row.fields.length}</Typography>,
      },
      {
        field: 'verified',
        headerName: 'Verified',
        width: 170,
        sortable: false,
        filterable: false,
        renderCell: (p: { row: Report }) => (
          <Box sx={{ width: 110 }}>
            <LinearProgress
              variant="determinate"
              value={verifiedRatio(p.row)}
              aria-label={`Verified ${p.row.fields.filter((f) => f.status === 'verified').length} of ${p.row.fields.length}`}
              sx={{
                height: 5,
                borderRadius: 999,
                backgroundColor: '#eef2f6',
                '& .MuiLinearProgress-bar': { backgroundColor: '#059669', borderRadius: 999 },
              }}
            />
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
              {verifiedCount(p.row)}/{p.row.fields.length}
            </Typography>
          </Box>
        ),
      },
    ],
    [cases],
  )

  const compareCase = cases.find((c) => c.id === 'case-0006')
  const compareReports = reports.filter((r) => r.id === 'rpt-0003' || r.id === 'rpt-0004')

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Reports & documents"
        title="Reports"
        subtitle="OCR-extracted values stay marked for verification until a healthcare worker confirms them. No value is invented."
        action={
          <button
            onClick={() => navigate('/app/intake')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-b from-brand-600 to-brand-700 px-3.5 py-2 text-xs font-bold text-white shadow-sm shadow-brand-900/20 ring-1 ring-inset ring-brand-700 transition-all hover:from-brand-700 hover:to-brand-800 active:scale-[0.98]"
          >
            <Upload size={15} /> Upload a report
          </button>
        }
      />

      <InfoBanner tone="sky">
        Lab values are surfaced as <strong>neutral changes</strong> with the reference range — never as a diagnosis.
        Clinical interpretation belongs to qualified staff.
      </InfoBanner>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile label="Total reports" value={reports.length} tone="brand" icon={<FileText size={20} />} hint="pdf + images" />
        <KpiTile label="OCR completed" value={ocrDone} tone="emerald" icon={<ScanSearch size={20} />} hint="extraction done" />
        <KpiTile label="OCR failed / low quality" value={ocrFailed} tone="rose" icon={<ImageIcon size={20} />} hint="no values invented" />
        <KpiTile label="Fields verified" value={verified} tone="sky" icon={<ShieldCheck size={20} />} hint="by staff" />
      </div>

      <Card title="All reports" subtitle={`${reports.length} documents across the pilot`} pad={false}>
        <AppDataGrid<Report>
          rows={reports}
          columns={columns}
          ariaLabel="All reports"
          storageKey="reports"
          rowHeight={60}
          checkboxSelection={false}
          onRowClick={(r) => navigate(`/app/cases/${r.caseId}`)}
          quickFilterPlaceholder="Search reports…"
          emptyTitle="No reports yet"
          emptyBody="Upload a lab report or image to get started."
        />
      </Card>

      {compareCase && compareReports.length === 2 && (
        <Card
          title="Report comparison"
          subtitle='Neutral language only — "value changed from X to Y". A human interprets clinical meaning.'
        >
          <AppDataGrid<{ id: string; param: string; previous: string; current: string; delta: string }>
            rows={(compareReports[0]?.fields ?? []).map((f, i) => {
              const cur = compareReports[1]?.fields[i]
              return {
                id: f.id,
                param: f.param,
                previous: `${f.value}${f.unit ? ` ${f.unit}` : ''}`,
                current: `${cur?.value ?? '—'}${cur?.unit ? ` ${cur.unit}` : ''}`,
                delta: `${f.value} → ${cur?.value ?? '—'}`,
              }
            })}
            ariaLabel="Report comparison"
            getRowId={(r) => r.id}
            hideToolbar
            hideFooter
            defaultDensity="compact"
            columns={[
              {
                field: 'param',
                headerName: 'Parameter',
                flex: 1,
                renderCell: (p) => <span className="font-bold text-ink-800">{p.row.param}</span>,
              },
              { field: 'previous', headerName: `Previous (${compareReports[0]?.name ?? '—'})`, flex: 1.2, minWidth: 150 },
              {
                field: 'arrow',
                headerName: '',
                width: 46,
                sortable: false,
                filterable: false,
                disableColumnMenu: true,
                renderCell: () => (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <ArrowRight size={12} />
                  </span>
                ),
              },
              {
                field: 'current',
                headerName: `Current (${compareReports[1]?.name ?? '—'})`,
                flex: 1.2,
                minWidth: 150,
                renderCell: (p) => (
                  <span className="inline-flex items-center gap-2">
                    {p.row.current}
                    <span className="rounded bg-ink-50 px-1.5 py-0.5 text-[10px] text-ink-400">{p.row.delta}</span>
                  </span>
                ),
              },
            ]}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            {compareReports.flatMap((r) =>
              r.fields.map((f) => (
                <span
                  key={f.id}
                  className={
                    f.status === 'verified'
                      ? 'inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50/60 px-2.5 py-1.5 text-xs font-medium text-emerald-800'
                      : 'inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-xs font-medium text-amber-800'
                  }
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {f.param}: <strong>{f.status}</strong>
                </span>
              )),
            )}
          </div>
          <p className="mt-3 flex items-center gap-1.5 text-[11px] text-ink-400">
            <ShieldCheck size={13} className="text-brand-600" />
            The system does not conclude improvement, worsening, or disease from any change. Clinical interpretation
            belongs to the reviewing clinician.
          </p>
        </Card>
      )}
    </div>
  )
}

function verifiedCount(report: Report) {
  return report.fields.filter((f) => f.status === 'verified').length
}

function verifiedRatio(report: Report) {
  const total = report.fields.length
  return total ? (verifiedCount(report) / total) * 100 : 0
}
