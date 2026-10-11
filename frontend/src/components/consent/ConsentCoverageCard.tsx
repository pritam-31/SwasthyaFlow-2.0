import type { GridColDef } from '@mui/x-data-grid-pro'
import { BadgeCheck, ShieldAlert, ShieldQuestion } from 'lucide-react'
import { AppDataGrid } from '../AppDataGrid'
import { Badge, Card } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import type { ConsentCoverage, ConsentCoverageRow } from '../../types/consent.types'

export function ConsentCoverageCard({ coverage }: { coverage: ConsentCoverage }) {
  const { language } = useTriage()
  const labels = CONSENT_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]

  const columns: GridColDef<ConsentCoverageRow>[] = [
    {
      field: 'sessionId',
      headerName: 'Case',
      flex: 1,
      minWidth: 120,
      renderCell: (p) => <span className="font-mono text-ink-600">{p.row.sessionId}</span>,
    },
    {
      field: 'state',
      headerName: labels.statusHeading,
      width: 150,
      renderCell: (p) => (
        <Badge
          className={
            p.row.state === 'granted'
              ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
              : p.row.state === 'revoked'
                ? 'bg-rose-50 text-rose-700 ring-rose-200'
                : 'bg-ink-100 text-ink-500 ring-ink-200'
          }
          icon={
            p.row.state === 'granted' ? (
              <BadgeCheck size={11} />
            ) : p.row.state === 'revoked' ? (
              <ShieldAlert size={11} />
            ) : (
              <ShieldQuestion size={11} />
            )
          }
        >
          {p.row.state === 'granted' ? labels.active : p.row.state === 'revoked' ? labels.withdrawn : labels.none}
        </Badge>
      ),
    },
    {
      field: 'grantedAt',
      headerName: labels.grantedAt,
      flex: 1,
      minWidth: 150,
      renderCell: (p) => <span className="text-ink-500">{p.row.grantedAt ? formatAuditTime(p.row.grantedAt) : '—'}</span>,
    },
  ]

  return (
    <Card
      title={
        <>
          <BadgeCheck size={15} className="text-brand-600" /> {labels.coverageHeading}
        </>
      }
      subtitle={labels.coverageHint}
    >
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
          <p className="text-lg font-extrabold text-emerald-700">{coverage.granted}</p>
          <p className="text-[11px] text-emerald-700">{labels.active}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50/60 px-3 py-2">
          <p className="text-lg font-extrabold text-rose-700">{coverage.revoked}</p>
          <p className="text-[11px] text-rose-700">{labels.withdrawn}</p>
        </div>
        <div className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2">
          <p className="text-lg font-extrabold text-ink-600">{coverage.none}</p>
          <p className="text-[11px] text-ink-500">{labels.none}</p>
        </div>
      </div>

      <AppDataGrid<ConsentCoverageRow>
        rows={coverage.rows}
        columns={columns}
        ariaLabel={labels.coverageHeading}
        getRowId={(row) => row.sessionId}
        hideToolbar
        hideFooter
        defaultDensity="compact"
        maxHeight={288}
      />
    </Card>
  )
}
