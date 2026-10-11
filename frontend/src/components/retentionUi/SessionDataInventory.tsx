import type { GridColDef } from '@mui/x-data-grid-pro'
import { AppDataGrid } from '../AppDataGrid'
import { Card } from '../ui'
import { useTriage } from '../../context/TriageContext'
import { CODE_BY_INTAKE_LANGUAGE } from '../../types/language.types'
import { CONSENT_SECTION_LABELS } from '../../services/safetyPolicy'
import { formatAuditTime } from '../../lib/format'
import type { SessionDataInventory } from '../../types/retentionUi.types'

type InventoryRow = SessionDataInventory['rows'][number]

function inventoryColumns(labels: any): GridColDef<InventoryRow>[] {
  return [
    {
      field: 'label',
      headerName: labels.category,
      flex: 1,
      minWidth: 140,
      valueGetter: (_value, row) => row.label,
      renderCell: (p) => <span className="font-medium text-ink-700">{p.row.label}</span>,
    },
    {
      field: 'total',
      headerName: labels.records,
      width: 100,
      renderCell: (p) => <span className="text-ink-800">{p.row.total}</span>,
    },
    {
      field: 'eligible',
      headerName: labels.eligible,
      width: 100,
      renderCell: (p) =>
        p.row.eligible > 0 ? (
          <span className="font-semibold text-amber-700">{p.row.eligible}</span>
        ) : (
          <span className="text-ink-300">0</span>
        ),
    },
    {
      field: 'expiresAt',
      headerName: labels.expiresAt,
      width: 170,
      renderCell: (p) => <span className="text-ink-500">{p.row.expiresAt ? formatAuditTime(p.row.expiresAt) : '—'}</span>,
    },
    {
      field: 'whyRetained',
      headerName: labels.whyRetained,
      flex: 1.2,
      minWidth: 180,
      renderCell: (p) => <span className="text-ink-500">{p.row.whyRetained}</span>,
    },
  ]
}

export function SessionDataInventory({ inventory }: { inventory: SessionDataInventory }) {
  const { language } = useTriage()
  const labels = CONSENT_SECTION_LABELS[CODE_BY_INTAKE_LANGUAGE[language]]

  return (
    <Card title={<>{labels.inventoryHeading}</>} subtitle={labels.inventoryHint}>
      <div className="mb-3 flex flex-wrap gap-2 text-[11px] text-ink-500">
        <span>
          {labels.records}: <strong className="text-ink-800">{inventory.totalRecords}</strong>
        </span>
        <span>
          {labels.eligible}: <strong className="text-amber-700">{inventory.eligibleRecords}</strong>
        </span>
        <span>
          {labels.policyVersion}: <strong className="text-ink-800">{inventory.policyVersion}</strong>
        </span>
      </div>
      <AppDataGrid<InventoryRow>
        rows={inventory.rows}
        columns={inventoryColumns(labels)}
        ariaLabel={labels.inventoryHeading}
        getRowId={(row) => row.category}
        hideToolbar
        hideFooter
        defaultDensity="compact"
      />
    </Card>
  )
}
